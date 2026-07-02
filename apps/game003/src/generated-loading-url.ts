import { GAME003_LOADING_RESOURCE_URLS } from "./generated/game-loading.generated.js";

export function getGame003GeneratedLoadingResourceUrl(id: string): string {
  const resource = GAME003_LOADING_RESOURCE_URLS.find((item) => item.id === id);
  if (!resource) {
    throw new Error(`game003 loading resource "${id}" was not generated.`);
  }
  return resource.url;
}
