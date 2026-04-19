// Import the model helpers from the snapshot and print what they resolve to.
// We're bypassing the CLI entirely — just asking the source "what model would
// you send to the API right now?"
import { getMainLoopModel, renderModelName } from 'src/utils/model/model.js';
import { getModelStrings } from 'src/utils/model/modelStrings.js';

console.log('ANTHROPIC_MODEL env      =', process.env.ANTHROPIC_MODEL ?? '(unset)');
console.log('ANTHROPIC_DEFAULT_OPUS   =', process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? '(unset)');
try {
  const main = getMainLoopModel();
  console.log('getMainLoopModel()       =', main);
  console.log('renderModelName(main)    =', renderModelName(main));
} catch (e) {
  console.log('getMainLoopModel() threw =', (e as Error).message);
}
console.log('configured opus46        =', getModelStrings().opus46);
console.log('configured sonnet46      =', getModelStrings().sonnet46);
