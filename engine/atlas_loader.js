export async function loadAtlas(jsonUrl, spriteUrl, normalUrl) {
  const map = await fetch(jsonUrl).then(r => r.json());
  const sprite = new Image();
  sprite.src = spriteUrl;
  const normal = new Image();
  normal.src = normalUrl;
  return { map, sprite, normal };
}
