/** Turns Moto's internal module, class and attribute names into words people use. */

const SERVICE_LABELS: Record<string, string> = {
  acm: "ACM",
  acmpca: "ACM PCA",
  amp: "Prometheus",
  apigateway: "API Gateway",
  apigatewayv2: "API Gateway v2",
  appconfig: "AppConfig",
  applicationautoscaling: "Application Auto Scaling",
  appsync: "AppSync",
  athena: "Athena",
  autoscaling: "Auto Scaling",
  awslambda: "Lambda",
  backup: "Backup",
  batch: "Batch",
  bedrock: "Bedrock",
  bedrockagent: "Bedrock Agents",
  budgets: "Budgets",
  ce: "Cost Explorer",
  cloudformation: "CloudFormation",
  cloudfront: "CloudFront",
  cloudtrail: "CloudTrail",
  cloudwatch: "CloudWatch",
  codebuild: "CodeBuild",
  codecommit: "CodeCommit",
  codedeploy: "CodeDeploy",
  codepipeline: "CodePipeline",
  cognitoidentity: "Cognito Identity",
  cognitoidp: "Cognito User Pools",
  config: "Config",
  databrew: "DataBrew",
  datasync: "DataSync",
  dax: "DAX",
  directconnect: "Direct Connect",
  dms: "DMS",
  ds: "Directory Service",
  dsql: "Aurora DSQL",
  dynamodb: "DynamoDB",
  dynamodbstreams: "DynamoDB Streams",
  ebs: "EBS",
  ec2: "EC2",
  ecr: "ECR",
  ecs: "ECS",
  efs: "EFS",
  eks: "EKS",
  elasticache: "ElastiCache",
  elb: "Classic Load Balancing",
  elbv2: "Load Balancing",
  emr: "EMR",
  emrcontainers: "EMR on EKS",
  emrserverless: "EMR Serverless",
  es: "Elasticsearch",
  events: "EventBridge",
  firehose: "Firehose",
  fsx: "FSx",
  glacier: "Glacier",
  glue: "Glue",
  guardduty: "GuardDuty",
  iam: "IAM",
  identitystore: "Identity Store",
  inspector2: "Inspector",
  iot: "IoT Core",
  iotdata: "IoT Data",
  ivs: "IVS",
  kafka: "MSK",
  kinesis: "Kinesis",
  kinesisvideo: "Kinesis Video",
  kms: "KMS",
  lakeformation: "Lake Formation",
  logs: "CloudWatch Logs",
  macie2: "Macie",
  mediaconnect: "MediaConnect",
  medialive: "MediaLive",
  mediapackage: "MediaPackage",
  mediastore: "MediaStore",
  memorydb: "MemoryDB",
  mq: "Amazon MQ",
  networkmanager: "Network Manager",
  opensearchserverless: "OpenSearch Serverless",
  opensearch: "OpenSearch",
  organizations: "Organizations",
  osis: "OpenSearch Ingestion",
  quicksight: "QuickSight",
  ram: "Resource Access Manager",
  rds: "RDS",
  rdsdata: "RDS Data",
  redshift: "Redshift",
  redshiftdata: "Redshift Data",
  rekognition: "Rekognition",
  resiliencehub: "Resilience Hub",
  resourcegroups: "Resource Groups",
  route53: "Route 53",
  route53domains: "Route 53 Domains",
  route53resolver: "Route 53 Resolver",
  s3: "S3",
  s3control: "S3 Control",
  s3tables: "S3 Tables",
  s3vectors: "S3 Vectors",
  sagemaker: "SageMaker",
  scheduler: "EventBridge Scheduler",
  sdb: "SimpleDB",
  secretsmanager: "Secrets Manager",
  securityhub: "Security Hub",
  servicecatalog: "Service Catalog",
  servicediscovery: "Cloud Map",
  servicequotas: "Service Quotas",
  ses: "SES",
  sesv2: "SES v2",
  shield: "Shield",
  signer: "Signer",
  sns: "SNS",
  sqs: "SQS",
  ssm: "Systems Manager",
  ssoadmin: "IAM Identity Center",
  stepfunctions: "Step Functions",
  sts: "STS",
  swf: "SWF",
  textract: "Textract",
  timestreaminfluxdb: "Timestream for InfluxDB",
  timestreamquery: "Timestream Query",
  timestreamwrite: "Timestream Write",
  transcribe: "Transcribe",
  transfer: "Transfer Family",
  vpclattice: "VPC Lattice",
  wafv2: "WAF",
  workspaces: "WorkSpaces",
  workspacesweb: "WorkSpaces Web",
  xray: "X-Ray",
};

const MODEL_LABELS: Record<string, string> = {
  "s3/FakeKey": "Objects",
  "ec2/Ami": "AMIs",
  "ec2/VPC": "VPCs",
  "awslambda/LambdaFunction": "Functions",
  "dynamodb/Item": "Items",
};

const ACRONYMS = new Set(
  "acl acm ami api arn aws az cidr cpu db dns ebs ec2 eks fifo http https iam id ip ipv4 ipv6 kms sha sns sqs ssl sse tls ttl uri url uuid vpc".split(
    " ",
  ),
);

export function serviceLabel(service: string): string {
  return (
    SERVICE_LABELS[service] ?? service.charAt(0).toUpperCase() + service.slice(1)
  );
}

function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean);
}

function pluralize(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(settings|status|s)$/i.test(word) && !/(bus|ss)$/i.test(word)) return word;
  if (/(s|x|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** "FakeSecret" -> "Secrets", "SecurityGroup" -> "Security groups", "DBInstance" -> "DB instances" */
export function modelLabel(service: string, model: string): string {
  const known = MODEL_LABELS[`${service}/${model}`];
  if (known) return known;
  const words = splitWords(model.replace(/^Fake/, ""));
  const phrase = words.map((word, index) => {
    const isUpper = word.length > 1 && word === word.toUpperCase();
    if (isUpper) return word;
    return index === 0 ? word : word.toLowerCase();
  });
  if (phrase.length === 0) return model;
  phrase[phrase.length - 1] = pluralize(phrase[phrase.length - 1]);
  return phrase.join(" ");
}

/** "Fake bucket" style singular label for the inspector heading. */
export function modelSingular(service: string, model: string): string {
  if (service === "s3" && model === "FakeKey") return "S3 object";
  const words = splitWords(model.replace(/^Fake/, ""));
  const phrase = words.map((word, index) => {
    const isUpper = word.length > 1 && word === word.toUpperCase();
    return isUpper || index === 0 ? word : word.toLowerCase();
  });
  return `${serviceLabel(service)} ${phrase.join(" ")}`.replace(
    /^Lambda Lambda function/,
    "Lambda function",
  );
}

/**
 * "last_modified_ISO8601" -> "Last modified", "QueueArn" -> "Queue ARN".
 * Keys that look like user data (env vars, tag keys) are left exactly as they are.
 */
export function fieldLabel(key: string): string {
  if (/[.:/-]/.test(key) || /^[A-Z0-9_]+$/.test(key)) return key;
  const words = splitWords(key.replace(/_?(ISO8601|RFC1123)$/, ""));
  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower === "ipv4" ? "IPv4" : lower === "ipv6" ? "IPv6" : lower.toUpperCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}
