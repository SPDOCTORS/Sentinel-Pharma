const WorkspacePanel = ({
  as: Element = 'section',
  eyebrow,
  title,
  description,
  actions,
  children,
  className = ''
}) => (
  <Element className={`research-panel ${className}`.trim()}>
    {(eyebrow || title || description || actions) && (
      <header className="research-panel__header">
        <div className="min-w-0">
          {eyebrow && <p className="research-eyebrow">{eyebrow}</p>}
          {title && <h2 className="research-panel__title">{title}</h2>}
          {description && <p className="research-panel__description">{description}</p>}
        </div>
        {actions && <div className="research-panel__actions">{actions}</div>}
      </header>
    )}
    {children}
  </Element>
);

export default WorkspacePanel;
