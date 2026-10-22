import { cavityCoUse } from './kitchen-cavity';
import {
  comparableMeasurement,
  allocatableEquipmentCapabilities,
  equipmentResources,
  type Equipment,
  type KitchenPhase,
  type KitchenPlan,
  type KitchenState,
  type ResourceAssignment,
} from './kitchen';
import { equipmentTemplate } from './kitchen-catalog';

/** Bounded greedy allocator. A failed search is unresolved, never proof of impossibility. */
export function checkKitchenPlan(
  kitchen: KitchenState,
  phases: KitchenPhase[],
  strategy: 'parallel' | 'sequence' = 'sequence',
  maxHandsOn = 1,
): KitchenPlan {
  const plan: KitchenPlan = {
    kitchenRevision: kitchen.revision,
    status: 'compatible',
    assignments: [],
    issues: [],
    assumptions: [
      'Times are declared estimates, not observed durations. Occupancy must include release, holding, transfer and cleaning. No physical resources are reserved by this preview. Cavity co-use requires matching mode/temperature and measured same-level footprints including clearance; no shelves, stacking or exact completion time are inferred.',
    ],
  };
  const available = kitchen.items.filter((i) => i.availability === 'available');
  const pending = [...phases];
  const done = new Map<string, ResourceAssignment>();
  if (new Set(phases.map((p) => p.id)).size !== phases.length)
    return { ...plan, status: 'conflict', issues: ['Phase references must be unique.'] };
  let unknown = false;
  for (let pass = 0; pass < phases.length; pass++) {
    const index = pending.findIndex((p) => p.after.every((id) => done.has(id)));
    if (index < 0) break;
    const p = pending.splice(index, 1)[0]!;
    let start = Math.max(0, ...p.after.map((id) => done.get(id)!.end));
    if (strategy === 'sequence') start = Math.max(start, ...plan.assignments.map((a) => a.end));
    const needsVessel = p.needsVessel || p.capability.startsWith('heat-');
    const end = start + p.durationMinutes + p.releaseMinutes;
    const overlaps = plan.assignments.filter((a) => a.start < end && start < a.end);
    const occupied = new Set(overlaps.flatMap((a) => a.resourceIds));
    const selected: string[] = [];
    let units = 0;
    let needsInformation = false;
    const candidates = available.filter(
      (i) => !i.parentId && allocatableEquipmentCapabilities(i).includes(p.capability),
    );
    const fits = (item: Equipment, resourceIndex = 1) => {
      if (!p.amount) {
        if (p.capacityReviewRequired) {
          needsInformation = true;
          return false;
        }
        return true;
      }
      const need = comparableMeasurement(p.amount);
      const limits = item.measurements
        .filter((m) =>
          item.independentZones > 1
            ? m.resourceIndex === resourceIndex
            : !m.resourceIndex || m.resourceIndex === resourceIndex,
        )
        .map(comparableMeasurement)
        .filter(
          (m) => m.basis === need.basis && m.dimension === need.dimension && m.mode === need.mode,
        );
      if (limits.length !== 1) {
        needsInformation = true;
        return false;
      }
      return limits.some((m) => m.value >= need.value);
    };
    for (const item of candidates) {
      const accessories = p.accessoryIds.map((id) =>
        available.find((i) => i.id === id && i.parentId === item.id),
      );
      if (accessories.some((i) => !i)) continue;
      for (const [index, resource] of equipmentResources(item).entries()) {
        if (!needsVessel && !fits(item, index + 1)) continue;
        const cavityAssignment: ResourceAssignment = {
          phaseId: p.id,
          resourceIds: [resource],
          start,
          end,
          cavityLoad: p.cavityLoad,
          temperatureC: p.temperatureC,
          mode: p.mode,
        };
        if (p.cavityLoad) {
          const fit = cavityCoUse(item, resource, [cavityAssignment]);
          if (fit !== 'compatible') {
            needsInformation ||= fit === 'needs-information';
            continue;
          }
        }
        const ids = [
          resource,
          ...item.sharedResourceKeys.map((k) => `shared:${k}`),
          ...accessories.flatMap((i) => equipmentResources(i!)),
        ];
        let blocked = false;
        for (const id of ids) {
          if (selected.includes(id)) {
            blocked = true;
            break;
          }
          if (!occupied.has(id)) continue;
          const fit =
            id === resource && p.cavityLoad
              ? cavityCoUse(item, resource, [
                  ...overlaps.filter((assignment) => assignment.resourceIds.includes(resource)),
                  cavityAssignment,
                ])
              : 'conflict';
          if (fit !== 'compatible') {
            needsInformation ||= fit === 'needs-information';
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        if (needsVessel) {
          const induction = p.inductionRequired || p.capability === 'heat-induction';
          const oven = ['bake', 'roast', 'convection'].includes(p.capability);
          const vessel = available.find((i) => {
            if (
              (equipmentTemplate(i.typeKey)?.resource !== 'vessel' && i.typeKey !== 'custom') ||
              (p.vesselCapability
                ? !allocatableEquipmentCapabilities(i).includes(p.vesselCapability)
                : p.capability.startsWith('heat-') &&
                  !allocatableEquipmentCapabilities(i).some((capability) =>
                    ['vessel', 'pressure-vessel'].includes(capability),
                  )) ||
              equipmentResources(i).some((id) => occupied.has(id) || selected.includes(id))
            )
              return false;
            if (induction && i.induction !== 'yes') {
              if (i.induction === 'unknown') needsInformation = true;
              return false;
            }
            if (oven) {
              if (i.ovenSafe === 'no') return false;
              if (i.ovenSafe !== 'yes' || p.temperatureC == null || i.ovenMaxC == null) {
                needsInformation = true;
                return false;
              }
              if (i.ovenMaxC < p.temperatureC) return false;
            }
            return fits(i);
          });
          if (!vessel) continue;
          ids.push(...equipmentResources(vessel));
        }
        selected.push(...ids);
        units++;
        if (units === p.quantity) break;
      }
      if (units === p.quantity) break;
    }
    const handsOnConflict =
      p.handsOn &&
      overlaps.filter((a) => phases.find((v) => v.id === a.phaseId)?.handsOn).length >= maxHandsOn;
    if (units !== p.quantity || handsOnConflict) {
      unknown ||= needsInformation || kitchen.coverage !== 'confirmed';
      plan.issues.push(
        `${p.id}: ${needsInformation ? 'Confirm capacity, fit or compatibility' : handsOnConflict ? 'Simultaneous hands-on limit exceeded' : candidates.length ? 'Resources overlap or quantity is insufficient; review sequencing, vessels or another physical appliance' : 'No confirmed available capability'} (${p.capability}).`,
      );
      continue;
    }
    const assignment: ResourceAssignment = {
      phaseId: p.id,
      resourceIds: selected,
      start,
      end,
      cavityLoad: p.cavityLoad,
      temperatureC: p.temperatureC,
      mode: p.mode,
    };
    plan.assignments.push(assignment);
    done.set(p.id, assignment);
  }
  if (pending.length)
    plan.issues.push('Unresolved phase dependencies; review missing or cyclic references.');
  if (plan.issues.length) plan.status = unknown ? 'needs-information' : 'conflict';
  return plan;
}
