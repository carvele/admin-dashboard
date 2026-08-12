import { can } from './permissions';

describe('Role-Based Access Control (RBAC) Permissions', () => {
  test('grants full permissions to owner role', () => {
    expect(can('owner', 'archive_catalog')).toBe(true);
    expect(can('owner', 'delete_customer')).toBe(true);
    expect(can('owner', 'manage_staff')).toBe(true);
    expect(can('owner', 'manage_settings')).toBe(true);
  });

  test('grants admin permissions while guarding owner-only actions', () => {
    expect(can('admin', 'archive_catalog')).toBe(true);
    expect(can('admin', 'delete_customer')).toBe(true);
    expect(can('admin', 'manage_settings')).toBe(false);
  });

  test('restricts staff permissions from administrative actions', () => {
    expect(can('staff', 'view_catalog')).toBe(true);
    expect(can('staff', 'view_reservations')).toBe(true);
    expect(can('staff', 'delete_customer')).toBe(false);
    expect(can('staff', 'manage_settings')).toBe(false);
  });

  test('denies all permissions to unrecognized or blocked roles', () => {
    expect(can('blocked', 'view_catalog')).toBe(false);
    expect(can(null, 'view_catalog')).toBe(false);
    expect(can(undefined, 'view_catalog')).toBe(false);
  });
});
