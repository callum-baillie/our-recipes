import {
  comparableMeasurement,
  equipmentResources,
  type Equipment,
  type ResourceAssignment,
} from './kitchen';
import { equipmentTemplate } from './kitchen-catalog';
/** Conservative same-level strip fit: no inferred shelves, stacking, rotation or ingredient density. */
export function cavityCoUse(
  item: Equipment,
  resourceId: string,
  assignments: ResourceAssignment[],
): 'compatible' | 'conflict' | 'needs-information' {
  if (equipmentTemplate(item.typeKey)?.resource !== 'cavity' || !assignments.length)
    return 'conflict';
  if (assignments.some((assignment) => !assignment.cavityLoad)) return 'conflict';
  const first = assignments[0]!;
  if (assignments.some((assignment) => assignment.temperatureC === undefined || !assignment.mode))
    return 'needs-information';
  if (
    assignments.some(
      (assignment) =>
        assignment.temperatureC !== first.temperatureC || assignment.mode !== first.mode,
    )
  )
    return 'conflict';
  if (!item.capabilities.includes(first.mode!)) return 'needs-information';
  const resourceIndex = equipmentResources(item).indexOf(resourceId) + 1;
  if (!resourceIndex) return 'conflict';
  const limits = (basis: 'width' | 'depth' | 'height') =>
    item.measurements
      .filter(
        (value) =>
          value.basis === basis &&
          (!value.mode || value.mode === first.mode) &&
          (item.independentZones > 1
            ? value.resourceIndex === resourceIndex
            : !value.resourceIndex || value.resourceIndex === resourceIndex),
      )
      .map(comparableMeasurement);
  const width = limits('width'),
    depth = limits('depth'),
    height = limits('height');
  if (
    [width, depth, height].some(
      (values) => values.length !== 1 || values[0]!.dimension !== 'length',
    )
  )
    return 'needs-information';
  const loads = assignments.map((assignment) => assignment.cavityLoad!);
  if (Math.max(...loads.map((load) => load.heightMm)) > height[0]!.value) return 'conflict';
  const fitsAcross =
    loads.reduce((sum, load) => sum + load.widthMm, 0) <= width[0]!.value &&
    Math.max(...loads.map((load) => load.depthMm)) <= depth[0]!.value;
  const fitsFrontToBack =
    loads.reduce((sum, load) => sum + load.depthMm, 0) <= depth[0]!.value &&
    Math.max(...loads.map((load) => load.widthMm)) <= width[0]!.value;
  return fitsAcross || fitsFrontToBack ? 'compatible' : 'conflict';
}
