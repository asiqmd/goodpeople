import type { AssistantCitation } from '@gp/shared';

export const ASSISTANT_PATH = '/workspace/assistant';

export function citationLink(citation: AssistantCitation) {
  return ASSISTANT_PATH + '/source?' + new URLSearchParams({ ref: JSON.stringify(citation) });
}
