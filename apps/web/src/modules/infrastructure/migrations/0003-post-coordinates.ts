// Preserve old coordinates without claiming their unspecified reference system is BD-09.
export const postCoordinatesSql = `
ALTER TABLE posts ADD COLUMN coordinate_system TEXT NOT NULL DEFAULT 'legacy'
  CHECK(coordinate_system IN ('legacy', 'bd09'));
CREATE INDEX posts_nearby ON posts(status, deleted_at, coordinate_system, lat, lng);
`;
