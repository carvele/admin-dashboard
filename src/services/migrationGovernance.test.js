import fs from 'fs';
import path from 'path';

describe('Migration Governance Policy', () => {
  const migrationsDir = path.resolve(__dirname, '../../supabase/migrations');

  it('rejects any .sql files in admin-dashboard/supabase/migrations', () => {
    if (!fs.existsSync(migrationsDir)) {
      return;
    }
    const files = fs.readdirSync(migrationsDir);
    const sqlFiles = files.filter(
      (file) => file.endsWith('.sql') || file.endsWith('.sql.rollback')
    );
    expect(sqlFiles).toEqual([]);
  });

  it('requires README.md pointer to canonical Mobile lineage', () => {
    const readmePath = path.join(migrationsDir, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
    const content = fs.readFileSync(readmePath, 'utf8');
    expect(content).toContain('jezsy-mobile-app');
    expect(content).toContain('DEPRECATED');
  });
});
