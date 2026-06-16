// src/lib/schemas.ts
// DATA-01: Schema for latest.json manifests
// DATA-02: MinIO object key structure

export interface LatestManifest {
  schema: 1           // literal type — only version 1 is valid
  version: string     // semantic version string, e.g. '1.2.3'
  sha256: string      // hex SHA-256 hash of the .tar file
  size: number        // file size in bytes
  publishedAt: string // ISO 8601 timestamp, e.g. '2026-06-16T22:00:00.000Z'
}

// DATA-02: MinIO object key builders
// Object structure: {appName}/{version}.tar and {appName}/latest.json

export function tarKey(appName: string, version: string): string {
  return `${appName}/${version}.tar`
}

export function latestKey(appName: string): string {
  return `${appName}/latest.json`
}
