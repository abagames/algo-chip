/**
 * Re-export AlgoChipSynthesizer from @algo-chip/core for demo compatibility.
 *
 * The synthesizer implementation has been moved to @algo-chip/core package.
 * This file provides backward compatibility for the demo application.
 *
 * @deprecated Import directly from @algo-chip/core instead:
 * import { AlgoChipSynthesizer } from '@algo-chip/core';
 */

export { AlgoChipSynthesizer as ChipSynthesizer } from "@algo-chip/core";
