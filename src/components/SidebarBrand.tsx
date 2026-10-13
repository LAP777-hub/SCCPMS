import './SidebarBrand.css';

export default function SidebarBrand({ workspace }: { workspace: string }) {
  return (
    <div className="sidebar-brand">
      <img className="sidebar-brand-logo" src="/logo.png" alt="SPU-SCCPMS logo" width={152} height={152} />
      <span className="sidebar-brand-workspace">{workspace}</span>
    </div>
  );
}
