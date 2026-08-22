import React from 'react';
import './PageHeader.css';

/**
 * Standardized PageHeader component used across all dashboard screens.
 * Ensures consistent left-aligned title, subtitle, optional section tag,
 * and right-aligned action buttons across every view.
 *
 * @param {Object} props
 * @param {string} props.title - Main page title
 * @param {string} [props.subtitle] - Secondary description
 * @param {string} [props.category] - Small section tag/badge (e.g., 'CATALOG', 'OPERATIONS')
 * @param {React.ReactNode} [props.actions] - Right-aligned buttons/controls
 * @param {React.ReactNode} [props.badge] - Optional title badge (e.g. live count)
 * @param {string} [props.className] - Additional CSS classes
 */
export const PageHeader = ({
  title,
  subtitle,
  category,
  actions,
  badge,
  className = '',
}) => {
  return (
    <div className={`page-header-container ${className}`.trim()}>
      <div className="page-header-text">
        {category && <span className="page-header-category">{category}</span>}
        <div className="page-title-row">
          <h1 className="page-title font-serif">{title}</h1>
          {badge && <div className="page-title-badge">{badge}</div>}
        </div>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
};

export default PageHeader;
