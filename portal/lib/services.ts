export interface PortalService {
  id: string;
  name: string;
  description: string;
  url: string;
  launchPath?: string;
  gatewayAudience?: "eob" | "oqc" | "jarvis";
  defaultReturnPath?: string;
  icon: string;
  color: string;
  category: "engineering" | "business" | "guide";
  destination: "internal" | "external";
}

const EOB_URL = process.env.NEXT_PUBLIC_EOB_URL || "https://eob.10.182.252.32.sslip.io";
const OQC_URL = process.env.NEXT_PUBLIC_OQC_URL || "https://oqc.atlascopco.group";
const JARVIS_URL =
  process.env.NEXT_PUBLIC_JARVIS_URL || "https://sw-portal.atlascopco.group";

export const PORTAL_SERVICES: PortalService[] = [
  {
    id: "eob-dashboard",
    name: "Engineering Operation Board",
    description: "Project management, resource planning, and work tracking for EUV Program IS",
    url: EOB_URL,
    launchPath: "/launch/eob-dashboard",
    gatewayAudience: "eob",
    defaultReturnPath: "/dashboard",
    icon: "LayoutDashboard",
    color: "bg-blue-600",
    category: "engineering",
    destination: "external",
  },
  {
    id: "oqc",
    name: "Outbound Quality Control",
    description: "Automated test execution and equipment commissioning quality system",
    url: OQC_URL,
    launchPath: "/launch/oqc",
    gatewayAudience: "oqc",
    defaultReturnPath: "/",
    icon: "ClipboardCheck",
    color: "bg-emerald-600",
    category: "engineering",
    destination: "external",
  },
  {
    id: "jarvis",
    name: "IS Software Portal",
    description: "Jira and Confluence driven software delivery, release, sprint, and knowledge visibility portal",
    url: JARVIS_URL,
    launchPath: "/launch/jarvis",
    gatewayAudience: "jarvis",
    defaultReturnPath: "/",
    icon: "BrainCircuit",
    color: "bg-purple-600",
    category: "engineering",
    destination: "external",
  },
  {
    id: "testrig",
    name: "Virtual TestRig",
    description: "Digital Twin product end-to-end integrated test bench service",
    url: process.env.NEXT_PUBLIC_TESTRIG_URL || `http://dashboard.10-182-252-5.sslip.io`,
    icon: "Wrench",
    color: "bg-amber-600",
    category: "engineering",
    destination: "external",
  },
  {
    id: "pcas-software-portal",
    name: "Software Request Desk",
    description: "Software inquiry intake portal for NPI integrated systems and Abatement support",
    url: "https://ac-avi.atlassian.net/servicedesk/customer/portal/1",
    icon: "ClipboardList",
    color: "bg-rose-600",
    category: "engineering",
    destination: "external",
  },
  {
    id: "servicenow-it",
    name: "ServiceNow IT Services",
    description: "Business systems entry point for IT requests, hardware support, and workflow approvals",
    url: "https://atlascopco.service-now.com",
    icon: "Building2",
    color: "bg-cyan-700",
    category: "business",
    destination: "external",
  },
  {
    id: "quick-guides",
    name: "Quick Guides",
    description: "How-to guides for company systems — travel, purchasing, IT equipment, VPN, and more",
    url: "/guides",
    icon: "BookOpen",
    color: "bg-slate-600",
    category: "guide",
    destination: "internal",
  },
];

export function findPortalServiceById(id: string): PortalService | undefined {
  return PORTAL_SERVICES.find((service) => service.id === id);
}
