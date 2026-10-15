import 'server-only';
import { Helpers, VeSync, type Session } from 'tsvesync';
import { z } from 'zod';
import {
  calculateQnBodyComposition,
  type CompositionEstimate,
} from '@/lib/domain/qn-body-composition';

export class VeSyncScaleError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
const quietLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
export type ScaleReading = {
  userId: string;
  userLabel?: string;
  weightKilograms: number;
  measuredAt: string;
  bodyFatPercent?: number;
  compositionEstimate?: CompositionEstimate;
};
export type ScaleChoice = { config: string; name: string; model: string };
export const vesyncCredentialsSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(512),
    country: z.string().regex(/^[A-Z]{2}$/u),
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
  })
  .strict();

// V3 returns both primary and sub-user history; V2 can return only old primary
// readings. Verified against the connected ESF24 and two user-supplied reports.
// bfr matched body-fat percentages in both reports. Zero is an unavailable
// composition reading, not 0% body fat. Other composition fields are not returned.
export function parseVeSyncReadings(raw: unknown): ScaleReading[] {
  const payload = z
    .object({ result: z.object({ weightDatas: z.array(z.unknown()).max(1000) }) })
    .safeParse(raw);
  if (!payload.success)
    throw new VeSyncScaleError(
      'VeSync returned an unsupported scale response. You can enter your measurements manually.',
    );
  const row = z.object({
    weightG: z.number().finite().positive().max(1_000_000),
    timestamp: z.number().int().positive(),
    subUserID: z.union([z.string().max(100), z.number().int()]).nullish(),
    bfr: z.unknown().optional(),
    heightCm: z.unknown().optional(),
    age: z.unknown().optional(),
    gender: z.unknown().optional(),
    impedance: z.unknown().optional(),
    sportsMan: z.unknown().optional(),
  });
  const now = Date.now() + 300_000;
  return payload.data.result.weightDatas
    .flatMap((value) => {
      const parsed = row.safeParse(value);
      if (!parsed.success) return [];
      const date = new Date(parsed.data.timestamp * 1000);
      if (!Number.isFinite(date.getTime()) || date.getTime() > now || date.getUTCFullYear() < 2000)
        return [];
      const bodyFat = z.number().finite().positive().max(100).safeParse(parsed.data.bfr);
      const r = parsed.data;
      const calculationInputs = z
        .object({
          heightCm: z.number(),
          age: z.number(),
          gender: z.enum(['1', '2']),
          impedance: z.number(),
          sportsMan: z.union([z.literal(0), z.literal(false)]).optional(),
        })
        .safeParse(r);
      const compositionEstimate = calculationInputs.success
        ? calculateQnBodyComposition({
            weightKilograms: r.weightG / 1000,
            heightMeters: calculationInputs.data.heightCm / 100,
            age: calculationInputs.data.age,
            sex: calculationInputs.data.gender === '2' ? 'male' : 'female',
            impedance: calculationInputs.data.impedance,
          })
        : null;
      return [
        {
          ...(compositionEstimate ? { compositionEstimate } : {}),
          ...(bodyFat.success ? { bodyFatPercent: bodyFat.data } : {}),
          userId: String(parsed.data.subUserID ?? 0),
          weightKilograms: parsed.data.weightG / 1000,
          measuredAt: date.toISOString(),
        },
      ];
    })
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
}
function managerFor(session: Session, timeZone = 'UTC') {
  if (
    !['https://smartapi.vesync.com', 'https://smartapi.vesync.eu'].includes(
      session.apiBaseUrl.replace(/\/$/u, ''),
    )
  )
    throw new VeSyncScaleError('Reconnect VeSync to refresh the account region.', 409);
  const manager = new VeSync('', '', timeZone, {
    customLogger: quietLogger,
    redact: true,
    debug: false,
  });
  manager.hydrateSession(session);
  return manager;
}
async function request(manager: VeSync, path: string, body: Record<string, unknown>) {
  const [response, status] = await Helpers.callApi(
    path,
    'post',
    body,
    Helpers.reqHeaders(manager),
    manager,
    { skipAuthRetry: true },
  );
  if (status !== 200 || !response || response.code !== 0)
    throw new VeSyncScaleError(
      'VeSync could not provide scale data. Sync your ESF24 in the VeSync app, then reconnect here. Some accounts do not expose cloud measurements.',
    );
  return response as Record<string, unknown>;
}
export async function connectVeSync(input: z.infer<typeof vesyncCredentialsSchema>) {
  let session: Session | null = null;
  const manager = new VeSync(input.email, input.password, input.timeZone, {
    countryCode: input.country,
    customLogger: quietLogger,
    redact: true,
    debug: false,
    onTokenChange: (value) => {
      session = value;
    },
  });
  if (!(await manager.login()) || !session)
    throw new VeSyncScaleError(
      'VeSync sign-in failed. Check your email, password and account country. Accounts needing an extra verification step may need to sign in through VeSync first.',
      401,
    );
  const response = await request(
    manager,
    '/cloud/v1/deviceManaged/devices',
    Helpers.reqBody(manager, 'devicelist'),
  );
  const parsed = z
    .object({
      result: z.object({
        list: z
          .array(
            z
              .object({
                deviceType: z.string(),
                deviceName: z.string().optional(),
                configModule: z.string(),
              })
              .passthrough(),
          )
          .max(500),
      }),
    })
    .safeParse(response);
  if (!parsed.success)
    throw new VeSyncScaleError('VeSync signed you in but returned an unsupported device list.');
  const choices: ScaleChoice[] = parsed.data.result.list
    .filter((device) => /ESF[-_ ]?24/iu.test(device.deviceType))
    .map((device) => ({
      config: device.configModule,
      name: device.deviceName ?? 'Etekcity ESF24',
      model: device.deviceType,
    }));
  if (!choices.length)
    throw new VeSyncScaleError(
      'Signed in, but no ESF24 was found. Open VeSync, sync the scale, and check that you used the same account.',
      409,
    );
  return { session: session as Session, choices };
}
export async function readVeSyncScale(session: Session, config: string) {
  const manager = managerFor(session);
  const readings: ScaleReading[] = [];
  const seen = new Set<string>();
  // Bounded pagination avoids silently importing an old first page as latest.
  for (let page = 1; page <= 10; page++) {
    const payload = await request(manager, '/cloud/v3/deviceManaged/getWeighingDataV3', {
      ...Helpers.reqBody(manager, 'devicedetail'),
      pageSize: 100,
      page,
      debugMode: false,
      allData: true,
      method: 'getWeighingDataV3',
      configModule: config,
    });
    const parsed = parseVeSyncReadings(payload);
    const rows = (payload.result as { weightDatas: unknown[] }).weightDatas;
    let added = 0;
    for (const reading of parsed) {
      const key = `${reading.userId}:${reading.measuredAt}:${reading.weightKilograms}`;
      if (!seen.has(key)) {
        seen.add(key);
        readings.push(reading);
        added++;
      }
    }
    if (rows.length < 100) break;
    if (!added || page === 10)
      throw new VeSyncScaleError(
        'VeSync returned more history than can be safely read. No measurement was imported.',
      );
  }
  // Labels are helpful, but a temporarily unavailable profile lookup must not
  // prevent a user from reviewing their dated measurement and choosing it.
  const profiles = await request(manager, '/cloud/v2/user/getAllSubUserV2', {
    ...Helpers.reqBody(manager, 'devicedetail'),
    method: 'getAllSubUserV2',
    configModule: config,
    isAsc: false,
    pageSize: 300,
    debugMode: false,
  }).catch(() => null);
  const parsedProfiles = z
    .object({
      result: z.object({
        subUsers: z
          .array(
            z.object({
              subUserID: z.union([z.string().max(100), z.number().int()]),
              nickname: z.string().trim().min(1).max(120),
            }),
          )
          .max(300),
      }),
    })
    .safeParse(profiles);
  const labels = new Map(
    parsedProfiles.success
      ? parsedProfiles.data.result.subUsers.map((profile) => [
          String(profile.subUserID),
          profile.nickname,
        ])
      : [],
  );
  return readings
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))
    .map((reading) => ({
      ...reading,
      userLabel:
        labels.get(reading.userId) ??
        (reading.userId === '0' ? 'Primary VeSync profile' : `VeSync user ${reading.userId}`),
    }));
}
