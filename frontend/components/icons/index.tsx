import type { ComponentType } from "react";
import { createIcon, type IconAnimation, type IconProps, type IconVariant } from "./Icon";
import { paths, type IconName } from "./paths";

export type { IconProps, IconAnimation, IconVariant, IconName };

/* --- Content / services -------------------------------------------------- */
export const CodeIcon = createIcon("CodeIcon", paths.code);
export const CloudIcon = createIcon("CloudIcon", paths.cloud);
export const ChipIcon = createIcon("ChipIcon", paths.chip);
export const ShieldIcon = createIcon("ShieldIcon", paths.shield);
export const CybersecurityIcon = createIcon("CybersecurityIcon", paths.cybersecurity);
export const RocketIcon = createIcon("RocketIcon", paths.rocket);
export const ChartIcon = createIcon("ChartIcon", paths.chart);
export const AnalyticsIcon = createIcon("AnalyticsIcon", paths.analytics);
export const CartIcon = createIcon("CartIcon", paths.cart);
export const MegaphoneIcon = createIcon("MegaphoneIcon", paths.megaphone);
export const PaletteIcon = createIcon("PaletteIcon", paths.palette);
export const PenIcon = createIcon("PenIcon", paths.pen);
export const DatabaseIcon = createIcon("DatabaseIcon", paths.database);
export const GearIcon = createIcon("GearIcon", paths.gear);
export const AutomationIcon = createIcon("AutomationIcon", paths.automation);
export const GlobeIcon = createIcon("GlobeIcon", paths.globe);
export const MobileIcon = createIcon("MobileIcon", paths.mobile);
export const HandshakeIcon = createIcon("HandshakeIcon", paths.handshake);
export const ConsultingIcon = createIcon("ConsultingIcon", paths.consulting);
export const LightbulbIcon = createIcon("LightbulbIcon", paths.lightbulb);
export const WebsiteIcon = createIcon("WebsiteIcon", paths.website);
export const DevOpsIcon = createIcon("DevOpsIcon", paths.devops);
export const LayersIcon = createIcon("LayersIcon", paths.layers);
export const UsersIcon = createIcon("UsersIcon", paths.users);
export const StarIcon = createIcon("StarIcon", paths.star);

/* --- Interface ------------------------------------------------------------ */
export const ArrowRightIcon = createIcon("ArrowRightIcon", paths.arrowRight);
export const ArrowUpRightIcon = createIcon("ArrowUpRightIcon", paths.arrowUpRight);
export const ChevronDownIcon = createIcon("ChevronDownIcon", paths.chevronDown);
export const ChevronRightIcon = createIcon("ChevronRightIcon", paths.chevronRight);
export const CheckIcon = createIcon("CheckIcon", paths.check);
export const CloseIcon = createIcon("CloseIcon", paths.close);
export const MenuIcon = createIcon("MenuIcon", paths.menu);
export const PlusIcon = createIcon("PlusIcon", paths.plus);
export const SearchIcon = createIcon("SearchIcon", paths.search);
export const SunIcon = createIcon("SunIcon", paths.sun);
export const MoonIcon = createIcon("MoonIcon", paths.moon);
export const SystemIcon = createIcon("SystemIcon", paths.system);
export const TrashIcon = createIcon("TrashIcon", paths.trash);
export const UploadIcon = createIcon("UploadIcon", paths.upload);
export const DownloadIcon = createIcon("DownloadIcon", paths.download);
export const EditIcon = createIcon("EditIcon", paths.edit);
export const EyeIcon = createIcon("EyeIcon", paths.eye);
export const EyeOffIcon = createIcon("EyeOffIcon", paths.eyeOff);
export const ExternalLinkIcon = createIcon("ExternalLinkIcon", paths.externalLink);
export const LogoutIcon = createIcon("LogoutIcon", paths.logout);
export const GripIcon = createIcon("GripIcon", paths.grip);
export const InfoIcon = createIcon("InfoIcon", paths.info);
export const RefreshIcon = createIcon("RefreshIcon", paths.refresh);
export const CopyIcon = createIcon("CopyIcon", paths.copy);
export const ClockIcon = createIcon("ClockIcon", paths.clock);
export const InboxIcon = createIcon("InboxIcon", paths.inbox);
export const BellIcon = createIcon("BellIcon", paths.bell);
export const BellOffIcon = createIcon("BellOffIcon", paths.bellOff);
export const SendIcon = createIcon("SendIcon", paths.send);

/**
 * Registry keyed by the `icon` field stored on Service documents in MongoDB,
 * so backend data resolves to a component without a frontend service list.
 */
export const iconRegistry: Record<IconName, ComponentType<IconProps>> = {
  code: CodeIcon,
  cloud: CloudIcon,
  chip: ChipIcon,
  shield: ShieldIcon,
  cybersecurity: CybersecurityIcon,
  rocket: RocketIcon,
  chart: ChartIcon,
  analytics: AnalyticsIcon,
  cart: CartIcon,
  megaphone: MegaphoneIcon,
  palette: PaletteIcon,
  pen: PenIcon,
  database: DatabaseIcon,
  gear: GearIcon,
  automation: AutomationIcon,
  globe: GlobeIcon,
  mobile: MobileIcon,
  handshake: HandshakeIcon,
  consulting: ConsultingIcon,
  lightbulb: LightbulbIcon,
  website: WebsiteIcon,
  devops: DevOpsIcon,
  layers: LayersIcon,
  users: UsersIcon,
  star: StarIcon,
  arrowRight: ArrowRightIcon,
  arrowUpRight: ArrowUpRightIcon,
  chevronDown: ChevronDownIcon,
  chevronRight: ChevronRightIcon,
  check: CheckIcon,
  close: CloseIcon,
  menu: MenuIcon,
  plus: PlusIcon,
  search: SearchIcon,
  sun: SunIcon,
  moon: MoonIcon,
  system: SystemIcon,
  trash: TrashIcon,
  upload: UploadIcon,
  download: DownloadIcon,
  edit: EditIcon,
  eye: EyeIcon,
  eyeOff: EyeOffIcon,
  externalLink: ExternalLinkIcon,
  logout: LogoutIcon,
  grip: GripIcon,
  info: InfoIcon,
  refresh: RefreshIcon,
  copy: CopyIcon,
  clock: ClockIcon,
  inbox: InboxIcon,
  bell: BellIcon,
  bellOff: BellOffIcon,
  send: SendIcon,
};

/** Resolve an icon key safely — unknown keys degrade to an info glyph. */
export function getIcon(name: string | undefined | null): ComponentType<IconProps> {
  if (!name) return InfoIcon;
  return iconRegistry[name as IconName] ?? InfoIcon;
}

export { paths as iconPaths };
