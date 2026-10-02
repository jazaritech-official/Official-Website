import { Material, Object3D, Texture, type Mesh } from "three";

/**
 * Dispose every material a material instance may reference through common
 * texture slots. Materials are shared across meshes in places, but `dispose()`
 * on an already-disposed GPU resource is a safe no-op, so traversal may visit
 * the same material twice without harm.
 */
function disposeMaterial(material: Material): void {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}

/**
 * Recursively dispose geometries, materials and textures below `root`.
 *
 * Ownership: call this on objects the engine created. Shared, externally
 * owned resources (e.g. the PMREM render-target texture) are disposed by their
 * creating module, never here.
 */
export function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();

    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const entry of material) disposeMaterial(entry);
    } else if (material) {
      disposeMaterial(material);
    }
  });
  root.clear();
}
