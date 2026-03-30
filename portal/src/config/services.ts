export interface PortalService {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  color: string;
  category: "engineering" | "business" | "guide";
  /** If true, navigates within portal instead of opening a new tab */
  internal?: boolean;
}

const BASE_DOMAIN = import.meta.env.VITE_BASE_DOMAIN || "10.182.252.32.sslip.io";

export const PORTAL_SERVICES: PortalService[] = [
  {
    id: "eob-dashboard",
    name: "Engineering Operation Board",
    description:
      "Project management, resource planning, and work tracking for EUV Program IS",
    url: `https://eob.${BASE_DOMAIN}`,
    icon: "LayoutDashboard",
    color: "bg-blue-600",
    category: "engineering",
  },
  {
    id: "oqc",
    name: "Outbound Quality Control",
    description:
      "Automated test execution and equipment commissioning quality system",
    url: `https://oqc.${BASE_DOMAIN}`,
    icon: "ClipboardCheck",
    color: "bg-emerald-600",
    category: "engineering",
  },
  {
    id: "jarvis",
    name: "IS Software Portal",
    description:
      "Jira and Confluence driven software delivery, release, sprint, and knowledge visibility portal",
    url: `https://jarvis.${BASE_DOMAIN}`,
    icon: "BrainCircuit",
    color: "bg-purple-600",
    category: "engineering",
  },
  {
    id: "testrig",
    name: "Virtual TestRig",
    description:
      "Digital Twin product end-to-end integrated test bench service",
    url: import.meta.env.VITE_TESTRIG_URL || `http://dashboard.10-182-252-5.sslip.io`,
    icon: "Wrench",
    color: "bg-amber-600",
    category: "engineering",
  },
  {
    id: "pcas-software-portal",
    name: "Software Request Desk",
    description:
      "Software inquiry intake portal for NPI integrated systems and Abatement support",
    url: "https://ac-avi.atlassian.net/servicedesk/customer/portal/1",
    icon: "ClipboardList",
    color: "bg-rose-600",
    category: "engineering",
  },
  {
    id: "quick-guides",
    name: "Quick Guides",
    description:
      "How-to guides for company systems — travel, purchasing, IT equipment, VPN, and more",
    url: "/guides",
    icon: "BookOpen",
    color: "bg-slate-600",
    category: "guide",
    internal: true,
  },
];
