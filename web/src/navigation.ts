export function pushPath(path: string) {
  window.history.pushState(null, '', `${path}${window.location.hash}`)
}
