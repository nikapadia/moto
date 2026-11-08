import { describe, expect, it } from "vitest";
import { fieldLabel, modelLabel, serviceLabel } from "./labels";
import {
  buildInventory,
  chooseColumns,
  findMatch,
  findReferrers,
  isEmptyValue,
  parseTime,
  searchResources,
  statusTone,
} from "./resources";

const ACCOUNT = "123456789012";

function single(service: string, model: string, raw: Record<string, unknown>) {
  return buildInventory({ [service]: { [model]: [raw] } }).resources[0];
}

describe("identity", () => {
  it("uses the name attribute, then a Name tag, then the ID", () => {
    expect(single("s3", "FakeBucket", { name: "assets" }).name).toBe("assets");
    expect(
      single("ec2", "Instance", {
        id: "i-1",
        tags: [{ Key: "Name", Value: "web" }],
      }).name,
    ).toBe("web");
    expect(single("ec2", "Instance", { id: "i-1" }).name).toBe("i-1");
  });

  it("recognises type-specific attribute names", () => {
    const fn = single("awslambda", "LambdaFunction", {
      function_name: "worker",
      function_arn: `arn:aws:lambda:eu-west-1:${ACCOUNT}:function:worker`,
    });
    expect(fn.name).toBe("worker");
    expect(fn.region).toBe("eu-west-1");
    expect(fn.account).toBe(ACCOUNT);
  });

  it("ignores values that only look like a region", () => {
    expect(single("s3", "FakeKey", { name: "k", region_name: "aws" }).region).toBeNull();
    expect(single("ec2", "Volume", { id: "v", availability_zone: "us-east-1e" }).region).toBe(
      "us-east-1",
    );
  });

  it("keeps resources with the same identity apart", () => {
    const { resources, byUid } = buildInventory({
      s3: { FakeKey: [{ name: "a.txt" }, { name: "a.txt" }] },
    });
    expect(resources).toHaveLength(2);
    expect(byUid.size).toBe(2);
  });
});

describe("tags", () => {
  it.each([
    [{ tags: { env: "prod" } }],
    [{ tags: [{ Key: "env", Value: "prod" }] }],
    [{ tag_list: [{ key: "env", value: "prod", resource_id: "x" }] }],
  ])("normalises %j", (raw) => {
    expect(single("x", "Thing", { name: "n", ...raw }).tags).toEqual([
      { key: "env", value: "prod" },
    ]);
  });
});

describe("status", () => {
  it("finds lifecycle status but not settings that end in status", () => {
    expect(single("x", "T", { name: "n", state: "running" }).status?.tone).toBe("good");
    expect(single("x", "T", { name: "n", versioning_status: "Enabled" }).status).toBeNull();
    expect(single("x", "T", { name: "n", state: { Name: "stopped" } }).status?.label).toBe(
      "stopped",
    );
  });

  it("classifies words", () => {
    expect(statusTone("CREATE_FAILED")).toBe("bad");
    expect(statusTone("pending")).toBe("warn");
    expect(statusTone("ACTIVE")).toBe("good");
    expect(statusTone("terminated")).toBe("idle");
  });
});

describe("built-in resources", () => {
  const inventory = buildInventory({
    ec2: {
      Ami: [
        { id: "ami-seeded", owner_id: "801119661308", is_public: true },
        { id: "ami-mine", owner_id: ACCOUNT, is_public: false, account_id: ACCOUNT },
      ],
      Snapshot: [
        {
          id: "snap-seeded",
          owner_id: "801119661308",
          description: "Auto-created snapshot for AMI ami-seeded",
          volume_id: "vol-seeded",
        },
        { id: "snap-mine", owner_id: ACCOUNT, description: "backup", volume_id: "vol-mine" },
      ],
      Volume: [{ id: "vol-seeded" }, { id: "vol-mine" }],
      VPC: [
        { id: "vpc-default", is_default: true },
        { id: "vpc-mine", is_default: false },
      ],
      Subnet: [{ id: "subnet-d", default_for_az: true }],
      SecurityGroup: [
        { id: "sg-1", name: "default" },
        { id: "sg-2", name: "web" },
      ],
      RouteTable: [{ id: "rtb-main", main_association_id: "rtbassoc-1" }, { id: "rtb-mine", main_association_id: null }],
      EC2Backend: [{ region_name: "us-east-1" }],
    },
    events: { EventBus: [{ name: "default" }, { name: "orders" }] },
    redshift: {
      ParameterGroup: [{ name: "default.redshift-1.0" }],
      SecurityGroup: [{ name: "Default" }],
    },
    s3: { FakeBucket: [{ name: "assets" }], FakeGrant: [{ permissions: ["READ"] }] },
  });

  it("separates what Moto seeded from what was deployed", () => {
    const deployed = inventory.resources.filter((r) => !r.builtin).map((r) => r.name);
    expect(deployed.sort()).toEqual(
      ["ami-mine", "assets", "orders", "rtb-mine", "snap-mine", "vol-mine", "vpc-mine", "web"].sort(),
    );
  });
});

describe("references", () => {
  const inventory = buildInventory({
    iam: { Role: [{ name: "worker", arn: `arn:aws:iam::${ACCOUNT}:role/worker` }] },
    awslambda: {
      LambdaFunction: [
        { function_name: "fn", role: `arn:aws:iam::${ACCOUNT}:role/worker` },
      ],
    },
    sqs: { Queue: [{ name: "unrelated" }] },
  });

  it("indexes ARNs so values can link to resources", () => {
    expect(inventory.references.get(`arn:aws:iam::${ACCOUNT}:role/worker`)?.name).toBe("worker");
  });

  it("finds what refers to a resource", () => {
    const role = inventory.resources.find((r) => r.name === "worker")!;
    expect(findReferrers(role, inventory.resources).map((r) => r.name)).toEqual(["fn"]);
  });
});

describe("search", () => {
  const { resources } = buildInventory({
    s3: {
      FakeBucket: [
        { name: "logs", tags: { team: "orders" } },
        { name: "orders-archive" },
        { name: "images" },
      ],
    },
  });

  it("searches every value, ranking name matches first", () => {
    expect(searchResources(resources, "ORDERS").map((r) => r.name)).toEqual([
      "orders-archive",
      "logs",
    ]);
  });

  it("requires every word to match", () => {
    expect(searchResources(resources, "logs orders").map((r) => r.name)).toEqual(["logs"]);
  });

  it("ignores class constants but not user data that happens to be in capitals", () => {
    const { resources: queues } = buildInventory({
      sqs: {
        Queue: [
          { name: "a", ALLOWED_PERMISSIONS: ["ReceiveMessage"], environment: { TABLE: "orders" } },
        ],
      },
    });
    expect(searchResources(queues, "ReceiveMessage")).toEqual([]);
    expect(searchResources(queues, "orders")).toHaveLength(1);
    expect(findMatch(queues[0].raw, "orders")).toEqual({
      path: "Environment, TABLE",
      text: "orders",
    });
    expect(findMatch(queues[0].raw, "receivemessage")).toBeNull();
    expect(findMatch({ MaxRetries: 3 }, "retries")).toEqual({
      path: "Attribute",
      text: "MaxRetries",
    });
  });
});

describe("isEmptyValue", () => {
  it("looks inside objects and lists", () => {
    expect(isEmptyValue({ LastUsedDate: null, Region: null })).toBe(true);
    expect(isEmptyValue([{}, []])).toBe(true);
    expect(isEmptyValue({ a: { b: 0 } })).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
  });
});

describe("parseTime", () => {
  it("reads the formats Moto produces", () => {
    expect(parseTime("last_modified", "2026-11-08T07:31:14.189840000Z")?.toISOString()).toBe(
      "2026-11-08T07:31:14.189Z",
    );
    expect(parseTime("created_timestamp", 1794123072.5)?.getUTCFullYear()).toBe(2026);
    expect(parseTime("last_modified_RFC1123", "Sun, 08 Nov 2026 07:31:12 GMT")).not.toBeNull();
  });

  it("leaves other numbers and strings alone", () => {
    expect(parseTime("timeout", 3)).toBeNull();
    expect(parseTime("run_time", "python3.11")).toBeNull();
    expect(parseTime("size", 1794123072)).toBeNull();
  });
});

describe("columns", () => {
  it("uses curated columns when a type has them", () => {
    const { resources } = buildInventory({
      ec2: {
        Instance: [
          { id: "i-1", instance_type: "t3.small", private_ip_address: "10.0.0.1", hypervisor: "xen" },
        ],
      },
    });
    const visible = chooseColumns("ec2", "Instance", resources).filter((c) => c.visible);
    expect(visible.map((c) => c.key)).toEqual(["instance_type", "private_ip_address"]);
  });

  it("falls back to useful scalars, skipping noise", () => {
    const { resources } = buildInventory({
      x: {
        Widget: [
          { name: "a", engine: "v8", arn: "arn:aws:x:::a", etag: "abc", enabled: false, days: 0, details: {} },
          { name: "b", engine: "v9", arn: "arn:aws:x:::b", etag: "def", enabled: false, days: 0, details: {} },
        ],
      },
    });
    const visible = chooseColumns("x", "Widget", resources).filter((c) => c.visible);
    expect(visible.map((c) => c.key)).toEqual(["engine"]);
  });
});

describe("labels", () => {
  it("names services", () => {
    expect(serviceLabel("awslambda")).toBe("Lambda");
    expect(serviceLabel("somethingnew")).toBe("Somethingnew");
  });

  it.each([
    ["s3", "FakeBucket", "Buckets"],
    ["s3", "FakeKey", "Objects"],
    ["ec2", "SecurityGroup", "Security groups"],
    ["ec2", "VPC", "VPCs"],
    ["iam", "ManagedPolicy", "Managed policies"],
    ["events", "EventBus", "Event buses"],
    ["rds", "DBInstance", "DB instances"],
  ])("names %s %s as %s", (service, model, label) => {
    expect(modelLabel(service, model)).toBe(label);
  });

  it.each([
    ["creation_date_ISO8601", "Creation date"],
    ["QueueArn", "Queue ARN"],
    ["private_ip_address", "Private IP address"],
    ["TABLE", "TABLE"],
    ["aws:cloudformation:stack", "aws:cloudformation:stack"],
  ])("labels field %s as %s", (key, label) => {
    expect(fieldLabel(key)).toBe(label);
  });
});
