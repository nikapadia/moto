/**
 * Makes sense of /moto-api/data.json, which is a dump of every Python object Moto
 * tracks: { service: { ClassName: [ { attribute: value } ] } }.
 *
 * Attribute names differ per service and thousands of the objects are things Moto
 * seeded by itself, so this works out what each one is called, where it lives, and
 * whether the user actually deployed it.
 */

import { fieldLabel } from "./labels";

export type Raw = Record<string, unknown>;
export type ModelData = Record<string, Record<string, Raw[]>>;
export type StatusTone = "good" | "warn" | "bad" | "idle";

export interface Tag {
  key: string;
  value: string;
}

export interface Status {
  key: string;
  label: string;
  tone: StatusTone;
}

export interface Resource {
  uid: string;
  service: string;
  model: string;
  raw: Raw;
  name: string;
  id: string | null;
  arn: string | null;
  region: string | null;
  account: string | null;
  status: Status | null;
  tags: Tag[];
  tagKeys: string[];
  created: { key: string; label: string; at: Date } | null;
  builtin: boolean;
  searchText: string | null;
}

export interface Inventory {
  resources: Resource[];
  byUid: Map<string, Resource>;
  /** ARNs and generated IDs, for linking one resource to another. */
  references: Map<string, Resource>;
}

const REGION = /^[a-z]{2}(-[a-z]+)+-\d+$/;
const ACCOUNT = /^\d{12}$/;
const ARN = /^arn:[^:]*:[^:]*:/;
const GENERATED_ID =
  /^([a-z0-9]+-[0-9a-f]{6,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Bookkeeping objects, not things anyone would call a resource. */
const INTERNAL_MODELS = new Set([
  "apigateway/Account",
  "dynamodb/Item",
  "ec2/EC2Backend",
  "ec2/NetworkAclEntry",
  "ec2/Route",
  "ec2/SecurityGroupRule",
  "ec2/VolumeAttachment",
  "iam/AccountSummary",
  "iot/FakeIndexingConfiguration",
  "quicksight/QuicksightAccountSettings",
  "ram/ManagedPermission",
  "ram/ResourceType",
  "s3/FakeAcl",
  "s3/FakeGrant",
  "s3/FakeGrantee",
]);

const NAME_KEYS = [
  "name",
  "function_name",
  "queue_name",
  "table_name",
  "topic_name",
  "user_name",
  "role_name",
  "group_name",
  "stream_name",
  "cluster_name",
  "alarm_name",
  "rule_name",
  "display_name",
  "title",
  "identifier",
  "db_instance_identifier",
  "db_cluster_identifier",
];

const STATUS_KEYS = [
  "state",
  "status",
  "state_name",
  "key_state",
  "instance_state",
  "lifecycle_state",
  "db_instance_status",
  "cluster_status",
  "table_status",
  "stack_status",
];

const STATUS_NOT_LIFECYCLE =
  /versioning|monitoring|transition|rotation|tracing|ttl|lock|tiering|code|logging|encryption|recovery|backup/;

const TAG_KEYS = ["tags", "tag_list", "tag_set"];
const TIME_KEY = /time|date|creat|modif|updat|launch|_at$|ISO8601|RFC1123/i;

function text(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** The last word of a class name, in lowercase: "LambdaFunction" -> "function". */
function modelNoun(model: string): string {
  const words = model.replace(/^Fake/, "").match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*/g);
  return (words?.[words.length - 1] ?? model).toLowerCase();
}

export function isScalar(value: unknown): value is string | number | boolean {
  return ["string", "number", "boolean"].includes(typeof value);
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  // { LastUsedDate: null, Region: null } has nothing to say either
  if (Array.isArray(value)) return value.every(isEmptyValue);
  if (typeof value === "object") return Object.values(value).every(isEmptyValue);
  return false;
}

/** Dates arrive as ISO strings (some with nanoseconds), RFC 1123 strings and epoch numbers. */
export function parseTime(key: string, value: unknown): Date | null {
  if (typeof value === "number") {
    if (!TIME_KEY.test(key) || value < 1e9 || value > 1e13) return null;
    return new Date(value < 1e11 ? value * 1000 : value);
  }
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
    const date = new Date(value.replace(/(\.\d{3})\d+/, "$1").replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (TIME_KEY.test(key) && /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function statusTone(value: string): StatusTone {
  const word = value.toLowerCase();
  if (/fail|error|fatal|impaired|unhealthy|rollback|incompatible/.test(word)) return "bad";
  if (
    /pending|creating|updating|starting|stopping|modifying|progress|provisioning|deleting|rebooting|queued|waiting/.test(
      word,
    )
  )
    return "warn";
  if (
    /running|active|available|^ok$|enabled|in[-_]use|succe|complete|healthy|ready|online|passed|deployed|issued|confirmed|associated|attached/.test(
      word,
    )
  )
    return "good";
  return "idle";
}

function findArn(raw: Raw, model: string): string | null {
  const noun = modelNoun(model);
  for (const key of ["arn", `${noun}_arn`]) {
    const value = text(raw[key]);
    if (value && ARN.test(value)) return value;
  }
  return null;
}

function findTags(raw: Raw): { tags: Tag[]; keys: string[] } {
  const tags: Tag[] = [];
  const keys: string[] = [];
  for (const field of TAG_KEYS) {
    const value = raw[field];
    if (value === undefined) continue;
    keys.push(field);
    if (tags.length > 0) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item !== "object" || item === null) continue;
        const entry = item as Raw;
        const key = text(entry.Key ?? entry.key);
        if (key) tags.push({ key, value: text(entry.Value ?? entry.value) ?? "" });
      }
    } else if (typeof value === "object" && value !== null) {
      for (const [key, tagValue] of Object.entries(value)) {
        tags.push({ key, value: text(tagValue) ?? "" });
      }
    }
  }
  return { tags, keys };
}

function findId(raw: Raw, model: string): string | null {
  const noun = modelNoun(model);
  for (const key of ["id", `${noun}_id`, "resource_id"]) {
    const value = text(raw[key]);
    if (value) return value;
  }
  return null;
}

function findName(
  raw: Raw,
  model: string,
  tags: Tag[],
  id: string | null,
  arn: string | null,
): string | null {
  for (const key of [...NAME_KEYS, `${modelNoun(model)}_name`]) {
    const value = text(raw[key]);
    if (value) return value;
  }
  const nameTag = tags.find((tag) => tag.key === "Name" && tag.value);
  if (nameTag) return nameTag.value;
  if (id) return id;
  if (arn) return arn.split(/[:/]/).pop() || arn;
  return text(raw.physical_resource_id);
}

function findRegion(raw: Raw, arn: string | null): string | null {
  for (const key of ["region_name", "region", "location"]) {
    const value = text(raw[key]);
    if (value && REGION.test(value)) return value;
  }
  const fromArn = arn?.split(":")[3];
  if (fromArn && REGION.test(fromArn)) return fromArn;
  const zone = text(raw.availability_zone);
  if (zone && REGION.test(zone.slice(0, -1))) return zone.slice(0, -1);
  return null;
}

function findAccount(raw: Raw, arn: string | null): string | null {
  const fromField = text(raw.account_id) ?? text(raw.owner_id);
  if (fromField && ACCOUNT.test(fromField)) return fromField;
  const fromArn = arn?.split(":")[4];
  return fromArn && ACCOUNT.test(fromArn) ? fromArn : null;
}

function findStatus(raw: Raw): Status | null {
  const generic = Object.keys(raw).filter(
    (key) => /(^|_)(status|state)$/.test(key) && !STATUS_NOT_LIFECYCLE.test(key),
  );
  for (const key of [...STATUS_KEYS, ...generic]) {
    const value = raw[key];
    const label =
      typeof value === "string"
        ? value
        : typeof value === "object" && value !== null
          ? text((value as Raw).Name ?? (value as Raw).Status ?? (value as Raw).name)
          : null;
    if (label && label.length <= 28) {
      return { key, label, tone: statusTone(label) };
    }
  }
  return null;
}

function findCreated(raw: Raw): Resource["created"] {
  const keys = Object.keys(raw).filter((key) => !/RFC1123$/.test(key));
  for (const [pattern, label] of [
    [/creat|launch|^start_time$/i, "Created"],
    [/modif|updat/i, "Updated"],
  ] as const) {
    for (const key of keys) {
      if (!pattern.test(key) || /last_used/i.test(key)) continue;
      const at = parseTime(key, raw[key]);
      if (at) return { key, label, at };
    }
  }
  return null;
}

/**
 * True for what Moto creates by itself. Worked out by instantiating every backend in
 * a fresh process and looking at what exists before any request has been made.
 */
function isBuiltin(
  resource: Resource,
  accounts: Set<string>,
  seededVolumes: Set<string>,
): boolean {
  const { service, model, raw, name } = resource;
  const key = `${service}/${model}`;
  if (INTERNAL_MODELS.has(key)) return true;
  // "default", "Default", "default.redshift-1.0"
  if (/^default(\.|$)/i.test(name)) return true;
  const owner = text(raw.owner_id);
  const foreignOwner = owner !== null && !accounts.has(owner);
  switch (key) {
    case "ec2/Ami":
      return raw.is_public === true && foreignOwner;
    case "ec2/Snapshot":
      return foreignOwner && String(raw.description).startsWith("Auto-created snapshot");
    case "ec2/Volume":
      return seededVolumes.has(resource.id ?? name);
    case "ec2/ManagedPrefixList":
      return owner === "AWS";
    case "ec2/NetworkAcl":
      return raw.default === true;
    case "ec2/RouteTable":
      return Boolean(raw.main_association_id);
    case "ec2/Subnet":
      return raw.default_for_az === true;
    case "ec2/VPC":
      return raw.is_default === true;
    case "athena/WorkGroup":
      return name === "primary";
    case "kms/Key":
      return raw.key_manager === "AWS";
    default:
      return false;
  }
}

export function buildInventory(data: ModelData): Inventory {
  const resources: Resource[] = [];
  const byUid = new Map<string, Resource>();

  for (const [service, models] of Object.entries(data)) {
    for (const [model, rows] of Object.entries(models)) {
      rows.forEach((raw, index) => {
        const arn = findArn(raw, model);
        const id = findId(raw, model);
        const { tags, keys: tagKeys } = findTags(raw);
        const name = findName(raw, model, tags, id, arn);
        const identity = arn ?? id ?? name ?? `record-${index}`;
        let uid = `${service}/${model}/${identity}`;
        // Moto keeps overwritten S3 objects, so identities are not always unique
        if (byUid.has(uid)) uid = `${uid}~${index}`;
        const resource: Resource = {
          uid,
          service,
          model,
          raw,
          name: name ?? `Record ${index + 1}`,
          id: id && id !== name ? id : null,
          arn,
          region: findRegion(raw, arn),
          account: findAccount(raw, arn),
          status: findStatus(raw),
          tags,
          tagKeys,
          created: findCreated(raw),
          builtin: name === null,
          searchText: null,
        };
        resources.push(resource);
        byUid.set(uid, resource);
      });
    }
  }

  const accounts = new Set<string>(["123456789012"]);
  for (const { raw } of resources) {
    const account = text(raw.account_id);
    if (account) accounts.add(account);
  }
  const seededVolumes = new Set<string>();
  for (const { service, model, raw } of resources) {
    const owner = text(raw.owner_id);
    if (
      service === "ec2" &&
      model === "Snapshot" &&
      owner &&
      !accounts.has(owner) &&
      typeof raw.volume_id === "string"
    ) {
      seededVolumes.add(raw.volume_id);
    }
  }

  const references = new Map<string, Resource>();
  for (const resource of resources) {
    resource.builtin = resource.builtin || isBuiltin(resource, accounts, seededVolumes);
    for (const key of [resource.arn, resource.id ?? resource.name]) {
      if (key && (ARN.test(key) || GENERATED_ID.test(key)) && !references.has(key)) {
        references.set(key, resource);
      }
    }
  }

  return { resources, byUid, references };
}

/** Class constants such as ALLOWED_PERMISSIONS describe the Python type, not this resource. */
export function isClassConstant(key: string): boolean {
  return /^[A-Z_]+$/.test(key);
}

function searchTextOf(resource: Resource): string {
  if (resource.searchText === null) {
    const own = Object.entries(resource.raw).filter(([key]) => !isClassConstant(key));
    resource.searchText = `${resource.name} ${JSON.stringify(own)}`.toLowerCase();
  }
  return resource.searchText;
}

export function matchesQuery(resource: Resource, query: string): boolean {
  const haystack = searchTextOf(resource);
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

/** Name matches first, then everything else, keeping the original order. */
export function searchResources(resources: Resource[], query: string): Resource[] {
  const first = query.toLowerCase().split(/\s+/).filter(Boolean)[0] ?? "";
  const matches = resources.filter((resource) => matchesQuery(resource, query));
  const nameMatch = (resource: Resource) =>
    resource.name.toLowerCase().includes(first) ? 0 : 1;
  return matches.sort((a, b) => nameMatch(a) - nameMatch(b));
}

/** Where a search term was found, for showing why a resource matched. */
export function findMatch(
  value: unknown,
  term: string,
  path = "",
): { path: string; text: string } | null {
  const isTopLevel = path === "";
  if (isScalar(value)) {
    return String(value).toLowerCase().includes(term)
      ? { path, text: String(value) }
      : null;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (isTopLevel && isClassConstant(key)) continue;
      const childPath = path ? `${path}, ${fieldLabel(key)}` : fieldLabel(key);
      if (key.toLowerCase().includes(term)) return { path: "Attribute", text: key };
      const found = findMatch(child, term, childPath);
      if (found) return found;
    }
  }
  return null;
}

/** Other resources that mention this one's ARN or generated ID. */
export function findReferrers(resource: Resource, all: Resource[]): Resource[] {
  const needles = [resource.arn, resource.id ?? resource.name]
    .filter((key): key is string => !!key && (ARN.test(key) || GENERATED_ID.test(key)))
    .map((key) => key.toLowerCase());
  if (needles.length === 0) return [];
  return all.filter(
    (other) =>
      other !== resource &&
      !other.builtin &&
      needles.some((needle) => searchTextOf(other).includes(needle)),
  );
}

export interface ColumnChoice {
  key: string;
  label: string;
  visible: boolean;
}

const PREFERRED_COLUMNS: Record<string, string[]> = {
  "awslambda/LambdaFunction": ["run_time", "memory_size", "handler"],
  "cloudwatch/Alarm": ["metric_name", "threshold", "comparison_operator"],
  "dynamodb/Table": ["billing_mode", "hash_key_attr"],
  "ec2/Instance": ["instance_type", "private_ip_address", "availability_zone"],
  "ec2/SecurityGroup": ["vpc_id", "description"],
  "ec2/Subnet": ["cidr_block", "vpc_id", "availability_zone"],
  "ec2/VPC": ["cidr_block"],
  "ec2/Volume": ["size", "volume_type", "availability_zone"],
  "events/Rule": ["schedule_exp", "event_bus_name"],
  "iam/Role": ["path", "max_session_duration", "description"],
  "iam/User": ["path"],
  "kms/Key": ["description", "key_spec"],
  "logs/LogGroup": ["retention_in_days", "stored_bytes"],
  "s3/FakeBucket": ["versioning_status"],
  "s3/FakeKey": ["bucket_name", "contentsize", "storage_class"],
  "secretsmanager/FakeSecret": ["description"],
  "sqs/Queue": ["visibility_timeout", "approximate_number_of_messages"],
  "ssm/Parameter": ["type", "value"],
};

const NEVER_DEFAULT_COLUMN =
  /^(arn|id|name|account_id|owner_id|partition|physical_resource_id|region|region_name|location)$|_arn$|etag|digest|sha|token|uuid|checksum|url|uri|domain|dns|_escaped|ISO8601|RFC1123/i;
const WORTH_SHOWING = /type|kind|engine|runtime|run_time|protocol|class|version|size|count|capacity|cidr|port|endpoint/;

/**
 * Picks the columns for a resource type. Everything scalar can be turned on from the
 * column menu, but only a handful of useful ones start visible.
 */
export function chooseColumns(service: string, model: string, rows: Resource[]): ColumnChoice[] {
  const counts = new Map<string, number>();
  const values = new Map<string, Set<string>>();
  for (const { raw } of rows) {
    for (const [key, value] of Object.entries(raw)) {
      if (isClassConstant(key) || !isScalar(value) || value === "") continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!values.has(key)) values.set(key, new Set());
      values.get(key)!.add(String(value));
    }
  }

  const preferred = PREFERRED_COLUMNS[`${service}/${model}`];
  const scored = [...counts.entries()]
    .filter(([key, count]) => {
      if (NEVER_DEFAULT_COLUMN.test(key) || count < rows.length * 0.6) return false;
      if (parseTime(key, rows.find((row) => row.raw[key] !== undefined)?.raw[key])) return false;
      if (rows.some((row) => row.status?.key === key || row.name === String(row.raw[key]))) return false;
      const first = rows.find((row) => row.raw[key] !== undefined)?.raw[key];
      const distinct = values.get(key)!;
      // A setting that is the same everywhere doesn't help tell rows apart
      if (typeof first === "boolean" && distinct.size === 1) return false;
      if (distinct.size === 1 && distinct.has("0")) return false;
      return [...values.get(key)!].every((value) => value.length <= 48);
    })
    .map(([key]) => key)
    .sort((a, b) => Number(WORTH_SHOWING.test(b)) - Number(WORTH_SHOWING.test(a)));

  const defaults = new Set(preferred?.filter((key) => counts.has(key)) ?? scored.slice(0, 3));
  return [...counts.keys()]
    .sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b)))
    .map((key) => ({ key, label: fieldLabel(key), visible: defaults.has(key) }))
    .sort((a, b) => {
      const order = (choice: ColumnChoice) => {
        const index = preferred?.indexOf(choice.key) ?? -1;
        return index === -1 ? 99 : index;
      };
      return order(a) - order(b);
    });
}
