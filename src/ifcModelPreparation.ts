import type { RawGeometryPart, RawIfcModel } from "./ifcInit";

export interface GeometryPreparationOptions {
  mergeMeshes?: boolean; // default: true
  generateNormals?: boolean; // default: false
  signal?: AbortSignal;
}

export interface PreparedIfcMeshData {
  expressID: number;
  colorId: number;
  color: { x: number; y: number; z: number; w: number } | null;
  positions: Float32Array<ArrayBufferLike>;
  normals: Float32Array<ArrayBufferLike>;
  indices: Uint32Array<ArrayBufferLike>;
}

export interface PreparedIfcModel {
  modelID: number;
  sourcePartCount: number;
  invalidPartCount: number;
  mergedGroupCount: number;
  meshes: PreparedIfcMeshData[];
}

interface InternalPreparedPart extends PreparedIfcMeshData {
  geometryExpressID: number;
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Operation was aborted", "AbortError");
  }
  const error = new Error("Operation was aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function areAllNormalsZero(normals: Float32Array<ArrayBufferLike>): boolean {
  for (let i = 0; i < normals.length; i++) {
    if (normals[i] !== 0) return false;
  }
  return true;
}

function computeNormals(
  positions: Float32Array<ArrayBufferLike>,
  indices: Uint32Array<ArrayBufferLike>,
): Float32Array<ArrayBufferLike> {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const x0 = positions[i0];
    const y0 = positions[i0 + 1];
    const z0 = positions[i0 + 2];
    const x1 = positions[i1];
    const y1 = positions[i1 + 1];
    const z1 = positions[i1 + 2];
    const x2 = positions[i2];
    const y2 = positions[i2 + 1];
    const z2 = positions[i2 + 2];

    const ux = x1 - x0;
    const uy = y1 - y0;
    const uz = z1 - z0;
    const vx = x2 - x0;
    const vy = y2 - y0;
    const vz = z2 - z0;

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    normals[i0] += nx;
    normals[i0 + 1] += ny;
    normals[i0 + 2] += nz;
    normals[i1] += nx;
    normals[i1 + 1] += ny;
    normals[i1 + 2] += nz;
    normals[i2] += nx;
    normals[i2 + 1] += ny;
    normals[i2 + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i];
    const y = normals[i + 1];
    const z = normals[i + 2];
    const len = Math.hypot(x, y, z);
    if (len > 0) {
      normals[i] = x / len;
      normals[i + 1] = y / len;
      normals[i + 2] = z / len;
    }
  }

  return normals;
}

function applyTransform(
  positions: Float32Array<ArrayBufferLike>,
  normals: Float32Array<ArrayBufferLike>,
  flatTransform: ArrayLike<number>,
): void {
  if (!flatTransform || flatTransform.length !== 16) return;

  const m00 = flatTransform[0];
  const m01 = flatTransform[1];
  const m02 = flatTransform[2];
  const m03 = flatTransform[3];
  const m10 = flatTransform[4];
  const m11 = flatTransform[5];
  const m12 = flatTransform[6];
  const m13 = flatTransform[7];
  const m20 = flatTransform[8];
  const m21 = flatTransform[9];
  const m22 = flatTransform[10];
  const m23 = flatTransform[11];
  const m30 = flatTransform[12];
  const m31 = flatTransform[13];
  const m32 = flatTransform[14];
  const m33 = flatTransform[15];

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    positions[i] = x * m00 + y * m10 + z * m20 + m30;
    positions[i + 1] = x * m01 + y * m11 + z * m21 + m31;
    positions[i + 2] = x * m02 + y * m12 + z * m22 + m32;

    if (m03 !== 0 || m13 !== 0 || m23 !== 0 || m33 !== 1) {
      const w = x * m03 + y * m13 + z * m23 + m33;
      if (w !== 0 && w !== 1) {
        positions[i] /= w;
        positions[i + 1] /= w;
        positions[i + 2] /= w;
      }
    }
  }

  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i];
    const y = normals[i + 1];
    const z = normals[i + 2];

    const nx = x * m00 + y * m10 + z * m20;
    const ny = x * m01 + y * m11 + z * m21;
    const nz = x * m02 + y * m12 + z * m22;
    const len = Math.hypot(nx, ny, nz);

    if (len > 0) {
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }
}

function validateRawPart(part: RawGeometryPart): string | null {
  const vertexCount = part.positions.length / 3;

  if (part.positions.length === 0 || part.positions.length % 3 !== 0) {
    return "positions must be a non-empty Float32Array with length divisible by 3";
  }
  if (part.indices.length === 0 || part.indices.length % 3 !== 0) {
    return "indices must be a non-empty Uint32Array with length divisible by 3";
  }
  for (let i = 0; i < part.positions.length; i++) {
    if (!Number.isFinite(part.positions[i])) {
      return `positions contains non-finite value at index ${i}`;
    }
  }
  for (let i = 0; i < part.normals.length; i++) {
    if (!Number.isFinite(part.normals[i])) {
      return `normals contains non-finite value at index ${i}`;
    }
  }
  for (let i = 0; i < part.indices.length; i++) {
    if (part.indices[i] >= vertexCount) {
      return `indices contains out-of-range vertex index ${part.indices[i]} (vertexCount=${vertexCount})`;
    }
  }
  return null;
}

function mergeParts(parts: InternalPreparedPart[], expressID: number, colorId: number): PreparedIfcMeshData {
  let positionCount = 0;
  let normalCount = 0;
  let indexCount = 0;

  for (const part of parts) {
    positionCount += part.positions.length;
    normalCount += part.normals.length;
    indexCount += part.indices.length;
  }

  const positions = new Float32Array(positionCount);
  const normals = new Float32Array(normalCount);
  const indices = new Uint32Array(indexCount);

  let vertexOffset = 0;
  let positionOffset = 0;
  let normalOffset = 0;
  let indexOffset = 0;

  for (const part of parts) {
    positions.set(part.positions, positionOffset);
    normals.set(part.normals, normalOffset);
    for (let i = 0; i < part.indices.length; i++) {
      indices[indexOffset + i] = part.indices[i] + vertexOffset;
    }
    vertexOffset += part.positions.length / 3;
    positionOffset += part.positions.length;
    normalOffset += part.normals.length;
    indexOffset += part.indices.length;
  }

  return {
    expressID,
    colorId,
    color: parts[0].color,
    positions,
    normals,
    indices,
  };
}

export function prepareIfcModelGeometry(
  model: RawIfcModel,
  options: GeometryPreparationOptions = {},
): PreparedIfcModel {
  const opts: GeometryPreparationOptions = {
    mergeMeshes: true,
    generateNormals: false,
    ...options,
  };

  let invalidPartCount = 0;
  const preparedParts: InternalPreparedPart[] = [];

  for (const part of model.parts) {
    throwIfAborted(opts.signal);
    const error = validateRawPart(part);
    if (error) {
      invalidPartCount++;
      continue;
    }

    const positions = new Float32Array(part.positions);
    let normals: Float32Array<ArrayBufferLike> = new Float32Array(part.normals);
    const indices = new Uint32Array(part.indices);
    const hasInvalidNormalLength = normals.length !== positions.length;

    if (hasInvalidNormalLength || (opts.generateNormals && areAllNormalsZero(normals))) {
      normals = computeNormals(positions, indices);
    }

    applyTransform(positions, normals, part.flatTransform);

    preparedParts.push({
      expressID: part.expressID,
      geometryExpressID: part.geometryExpressID,
      colorId: part.colorId,
      color: part.color,
      positions,
      normals,
      indices,
    });
  }

  const groups = new Map<string, InternalPreparedPart[]>();
  for (const part of preparedParts) {
    throwIfAborted(opts.signal);
    const key = `${part.expressID}-${part.colorId}`;
    const group = groups.get(key);
    if (group) {
      group.push(part);
    } else {
      groups.set(key, [part]);
    }
  }

  const meshes: PreparedIfcMeshData[] = [];
  let mergedGroupCount = 0;
  for (const group of groups.values()) {
    throwIfAborted(opts.signal);
    if (group.length === 0) continue;
    if (!opts.mergeMeshes || group.length === 1) {
      for (const item of group) {
        meshes.push({
          expressID: item.expressID,
          colorId: item.colorId,
          color: item.color,
          positions: item.positions,
          normals: item.normals,
          indices: item.indices,
        });
      }
    } else {
      meshes.push(mergeParts(group, group[0].expressID, group[0].colorId));
      mergedGroupCount++;
    }
  }

  return {
    modelID: model.modelID,
    sourcePartCount: model.rawStats.partCount,
    invalidPartCount,
    mergedGroupCount,
    meshes,
  };
}
