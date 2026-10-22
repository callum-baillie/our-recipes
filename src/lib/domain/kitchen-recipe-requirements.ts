import { comparableMeasurement, type KitchenPhase } from './kitchen';
import type { RecipeDetail } from '@/lib/services/recipe-service';
/** A source revision's hard requirements cannot be removed or replaced by an allocation proposal. */
export function checkRecipePhaseRequirements(
  recipe: Pick<RecipeDetail, 'title' | 'equipmentRequirements' | 'instructionSections'>,
  phases: KitchenPhase[],
) {
  const conflicts: string[] = [],
    unknowns: string[] = [];
  const used = new Set<string>();
  recipe.equipmentRequirements.forEach((requirement, index) => {
    const refs = requirement.steps.map(
      (ref) => recipe.instructionSections[ref.section]?.steps[ref.step]?.id,
    );
    if (!refs.length || refs.some((ref) => !ref)) {
      unknowns.push(
        `${recipe.title}: equipment requirement ${index + 1} needs refreshed step references.`,
      );
      return;
    }
    const candidate = phases.find(
      (phase) =>
        !used.has(phase.id) &&
        [requirement.capability, ...requirement.alternativeCapabilities].includes(
          phase.capability,
        ) &&
        phase.quantity >= requirement.quantity &&
        refs.every((ref) => phase.stepRefs.includes(ref!)),
    );
    if (!candidate) {
      conflicts.push(
        `${recipe.title}: requirement ${index + 1} (${requirement.capability}, quantity ${requirement.quantity}) is missing from its exact source steps. Review a coherent recipe adaptation instead of omitting or replacing equipment.`,
      );
      return;
    }
    used.add(candidate.id);
    if (requirement.amount) {
      const need = comparableMeasurement(requirement.amount),
        proposed = candidate.amount && comparableMeasurement(candidate.amount);
      if (
        !proposed ||
        proposed.basis !== need.basis ||
        proposed.dimension !== need.dimension ||
        proposed.mode !== need.mode ||
        proposed.value < need.value
      )
        conflicts.push(
          `${recipe.title}: requirement ${index + 1} must preserve the whole same-basis measured amount. Review quantity, units and batching.`,
        );
    }
    if (
      requirement.capacityReviewRequired &&
      !candidate.amount &&
      !candidate.capacityReviewRequired
    )
      unknowns.push(
        `${recipe.title}: requirement ${index + 1} still needs a measured capacity review; clearing a flag cannot establish fit.`,
      );
    if (
      requirement.vesselCapability &&
      (!(candidate.needsVessel || candidate.capability.startsWith('heat-')) ||
        candidate.vesselCapability !== requirement.vesselCapability)
    )
      conflicts.push(
        `${recipe.title}: requirement ${index + 1} needs the recorded ${requirement.vesselCapability.replaceAll('-', ' ')} as part of its resource bundle.`,
      );
    if (
      (requirement.mode && candidate.mode !== requirement.mode) ||
      (requirement.temperatureC !== undefined &&
        candidate.temperatureC !== requirement.temperatureC)
    )
      conflicts.push(
        `${recipe.title}: requirement ${index + 1} must preserve its reviewed mode and temperature.`,
      );
    if (
      requirement.cavityLoad &&
      (!candidate.cavityLoad ||
        (['widthMm', 'depthMm', 'heightMm'] as const).some(
          (dimension) => candidate.cavityLoad![dimension] < requirement.cavityLoad![dimension],
        ))
    )
      conflicts.push(
        `${recipe.title}: requirement ${index + 1} cannot shrink the reviewed dish footprint to hide a cavity conflict.`,
      );
  });
  return { conflicts, unknowns };
}
