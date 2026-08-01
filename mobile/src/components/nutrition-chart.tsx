import * as React from 'react';
import { Text, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { EditorialText, StatusPill, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';

export type HouseholdNutritionComparison = {
  periodDays: number;
  members: {
    key: string;
    label: string;
    observedDays: number;
    confirmedCount: number;
    nutrients: {
      nutrientCode: string;
      normalizedPercent: number;
      status: string;
    }[];
  }[];
};

export function NutritionGoalChart({
  comparison,
  memberKey,
}: {
  comparison?: unknown;
  memberKey?: string;
}) {
  const summary = comparison as HouseholdNutritionComparison | null | undefined;
  const member =
    summary?.members?.find((entry) => entry.key === memberKey) ?? summary?.members?.[0];
  if (!summary || !member?.nutrients.length) return null;
  const nutrients = member.nutrients.slice(0, 6);
  const rowHeight = 42;
  const height = nutrients.length * rowHeight + 30;
  const labelWidth = 78;
  const chartWidth = 190;
  const maxPercent = 140;
  const goalX = labelWidth + (100 / maxPercent) * chartWidth;
  return (
    <Surface elevated style={{ gap: tokens.space.sm }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <EditorialText variant="section">Goal balance</EditorialText>
          <Text style={[tokens.type.caption, { color: tokens.color.inkSecondary }]}>
            {member.label} · {summary.periodDays}-day server-confirmed view
          </Text>
        </View>
        <StatusPill>Goal 100%</StatusPill>
      </View>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 320 ${height}`}
        accessibilityLabel={`Nutrition goal chart for ${member.label}`}
      >
        <Line
          x1={goalX}
          x2={goalX}
          y1={4}
          y2={height - 20}
          stroke={tokens.color.gold}
          strokeWidth={2}
          strokeDasharray="4 4"
        />
        {nutrients.map((nutrient, index) => {
          const y = index * rowHeight + 8;
          const value = Math.max(0, Math.min(maxPercent, nutrient.normalizedPercent));
          const width = (value / maxPercent) * chartWidth;
          const color =
            nutrient.status === 'above'
              ? tokens.color.warning
              : nutrient.status === 'below'
                ? tokens.color.teal
                : tokens.color.olive;
          return (
            <React.Fragment key={nutrient.nutrientCode}>
              <SvgText x={0} y={y + 14} fill={tokens.color.ink} fontSize={11} fontWeight="700">
                {nutrient.nutrientCode.replaceAll('_', ' ').slice(0, 11)}
              </SvgText>
              <Rect
                x={labelWidth}
                y={y}
                width={chartWidth}
                height={18}
                rx={9}
                fill={tokens.color.paperMuted}
              />
              <Rect
                x={labelWidth}
                y={y}
                width={Math.max(3, width)}
                height={18}
                rx={9}
                fill={color}
              />
              <SvgText
                x={312}
                y={y + 14}
                textAnchor="end"
                fill={tokens.color.inkSecondary}
                fontSize={10}
                fontWeight="700"
              >
                {Math.round(nutrient.normalizedPercent)}%
              </SvgText>
            </React.Fragment>
          );
        })}
        <SvgText
          x={goalX}
          y={height - 4}
          textAnchor="middle"
          fill={tokens.color.gold}
          fontSize={10}
          fontWeight="700"
        >
          GOAL
        </SvgText>
      </Svg>
    </Surface>
  );
}
