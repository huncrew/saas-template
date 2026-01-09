/**
 * Oasify Context-Driven Template System
 * 
 * This defines the schema for YAML-based, modular templates that can be
 * combined and customized based on user context and requirements.
 */

// Core template configuration types
export interface TemplateConfig {
  metadata: TemplateMetadata;
  context: ContextRequirements;
  modules: ModuleConfiguration[];
  integrations: IntegrationConfig[];
  deployment: DeploymentConfig;
  customization: CustomizationOptions;
}

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  version: string;
  author: string;
  license: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedBuildTime: string;
  icon: string;
  preview?: {
    images: string[];
    liveDemo?: string;
    video?: string;
  };
}

export type TemplateCategory = 
  | 'ai-applications'
  | 'ecommerce'
  | 'saas-tools'
  | 'content-management'
  | 'analytics'
  | 'automation'
  | 'fintech'
  | 'healthcare'
  | 'education'
  | 'productivity';

// Context analysis and requirements
export interface ContextRequirements {
  domain: DomainContext;
  userType: UserType;
  dataTypes: DataType[];
  compliance: ComplianceRequirement[];
  scale: ScaleRequirement;
  integrations: string[];
  customRequirements: CustomRequirement[];
}

export interface DomainContext {
  primary: string;
  secondary?: string[];
  industry: string;
  useCase: string;
  targetAudience: string;
}

export type UserType = 'internal-tool' | 'customer-facing' | 'b2b-platform' | 'consumer-app' | 'enterprise';

export type DataType = 'documents' | 'images' | 'videos' | 'structured' | 'realtime' | 'financial' | 'personal' | 'medical';

export interface ComplianceRequirement {
  standard: 'GDPR' | 'HIPAA' | 'SOX' | 'PCI-DSS' | 'SOC2' | 'ISO27001';
  level: 'basic' | 'strict' | 'enterprise';
  features: string[];
}

// Modular system configuration
export interface ModuleConfiguration {
  type: ModuleType;
  variant: string;
  config: Record<string, any>;
  dependencies: string[];
  optional: boolean;
  conditionalLogic?: ConditionalLogic;
}

export type ModuleType = 
  | 'authentication'
  | 'database'
  | 'ai-integration'
  | 'payment-processing'
  | 'file-storage'
  | 'email-service'
  | 'search-engine'
  | 'analytics'
  | 'monitoring'
  | 'caching'
  | 'queue-system'
  | 'notification-service'
  | 'cms-integration'
  | 'api-gateway'
  | 'security-scanning';

export interface ConditionalLogic {
  condition: string;
  whenTrue: Partial<ModuleConfiguration>;
  whenFalse?: Partial<ModuleConfiguration>;
}

// Integration configurations
export interface IntegrationConfig {
  service: string;
  type: 'api' | 'webhook' | 'sdk' | 'database' | 'queue';
  authentication: AuthenticationMethod;
  configuration: Record<string, any>;
  environment: 'development' | 'staging' | 'production' | 'all';
}

export type AuthenticationMethod = 'api-key' | 'oauth2' | 'jwt' | 'basic-auth' | 'certificate';

// Deployment and infrastructure
export interface DeploymentConfig {
  platform: 'vercel' | 'aws' | 'gcp' | 'azure' | 'fly' | 'railway';
  regions: string[];
  environment: EnvironmentConfig[];
  scaling: ScalingConfig;
  monitoring: MonitoringConfig;
  security: SecurityConfig;
}

export interface EnvironmentConfig {
  name: string;
  variables: Record<string, string | number | boolean>;
  secrets: string[];
  services: ServiceConfig[];
}

export interface ServiceConfig {
  name: string;
  type: 'function' | 'container' | 'static' | 'database' | 'queue';
  configuration: Record<string, any>;
}

export interface ScalingConfig {
  auto: boolean;
  minInstances: number;
  maxInstances: number;
  triggers: ScalingTrigger[];
}

export interface ScalingTrigger {
  metric: 'cpu' | 'memory' | 'requests' | 'queue-length' | 'custom';
  threshold: number;
  action: 'scale-up' | 'scale-down';
}

// Customization and generation options
export interface CustomizationOptions {
  ui: UICustomization;
  features: FeatureCustomization;
  branding: BrandingCustomization;
  advanced: AdvancedCustomization;
}

export interface UICustomization {
  framework: 'react' | 'vue' | 'svelte' | 'nextjs' | 'nuxt';
  styling: 'tailwind' | 'styled-components' | 'emotion' | 'scss' | 'css-modules';
  componentLibrary: 'shadcn' | 'chakra' | 'mantine' | 'ant-design' | 'material-ui';
  theme: ThemeConfig;
  responsive: boolean;
  accessibility: AccessibilityConfig;
}

export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accent: string;
  neutral: string;
  background: string;
  surface: string;
  typography: TypographyConfig;
  spacing: SpacingConfig;
  borderRadius: string;
  shadows: ShadowConfig;
}

export interface TypographyConfig {
  fontFamily: string;
  headingFont?: string;
  sizes: Record<string, string>;
  weights: Record<string, number>;
  lineHeights: Record<string, number>;
}

export interface SpacingConfig {
  unit: number;
  scale: number[];
}

export interface ShadowConfig {
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface AccessibilityConfig {
  level: 'AA' | 'AAA';
  features: ('screen-reader' | 'keyboard-navigation' | 'high-contrast' | 'focus-indicators')[];
  testing: boolean;
}

export interface FeatureCustomization {
  enabled: string[];
  disabled: string[];
  configuration: Record<string, any>;
}

export interface BrandingCustomization {
  name: string;
  logo: string;
  favicon: string;
  colors: Record<string, string>;
  fonts: string[];
  voice: 'professional' | 'friendly' | 'technical' | 'casual';
}

export interface AdvancedCustomization {
  customCode: CustomCodeConfig[];
  hooks: HookConfig[];
  middleware: MiddlewareConfig[];
  plugins: PluginConfig[];
}

export interface CustomCodeConfig {
  location: string;
  type: 'component' | 'function' | 'middleware' | 'hook' | 'util';
  code: string;
  language: 'typescript' | 'javascript' | 'python' | 'go';
}

export interface HookConfig {
  event: string;
  handler: string;
  async: boolean;
  priority: number;
}

export interface MiddlewareConfig {
  name: string;
  path: string;
  order: number;
  configuration: Record<string, any>;
}

export interface PluginConfig {
  name: string;
  version: string;
  configuration: Record<string, any>;
}

// Additional utility types
export interface ScaleRequirement {
  users: 'small' | 'medium' | 'large' | 'enterprise';
  requests: number;
  storage: string;
  concurrent: number;
}

export interface CustomRequirement {
  type: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  implementation?: string;
}

export interface MonitoringConfig {
  logging: LoggingConfig;
  metrics: MetricsConfig;
  alerts: AlertConfig[];
  healthChecks: HealthCheckConfig[];
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  structured: boolean;
  retention: string;
  destinations: ('console' | 'file' | 'cloudwatch' | 'datadog' | 'newrelic')[];
}

export interface MetricsConfig {
  enabled: boolean;
  provider: 'prometheus' | 'datadog' | 'newrelic' | 'cloudwatch';
  customMetrics: string[];
}

export interface AlertConfig {
  name: string;
  condition: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: ('email' | 'slack' | 'pagerduty' | 'webhook')[];
}

export interface HealthCheckConfig {
  path: string;
  interval: string;
  timeout: string;
  retries: number;
}

export interface SecurityConfig {
  encryption: EncryptionConfig;
  authentication: AuthConfig;
  authorization: AuthorizationConfig;
  scanning: SecurityScanningConfig;
  compliance: ComplianceConfig;
}

export interface EncryptionConfig {
  atRest: boolean;
  inTransit: boolean;
  keyManagement: 'aws-kms' | 'gcp-kms' | 'azure-keyvault' | 'vault';
}

export interface AuthConfig {
  providers: string[];
  mfa: boolean;
  sessionManagement: SessionConfig;
  passwordPolicy: PasswordPolicyConfig;
}

export interface SessionConfig {
  duration: string;
  renewal: boolean;
  storage: 'memory' | 'redis' | 'database';
}

export interface PasswordPolicyConfig {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: string;
}

export interface AuthorizationConfig {
  model: 'rbac' | 'abac' | 'acl';
  roles: RoleConfig[];
  permissions: PermissionConfig[];
}

export interface RoleConfig {
  name: string;
  description: string;
  permissions: string[];
  hierarchy: number;
}

export interface PermissionConfig {
  name: string;
  resource: string;
  actions: string[];
}

export interface SecurityScanningConfig {
  dependencies: boolean;
  secrets: boolean;
  code: boolean;
  infrastructure: boolean;
  schedule: string;
}

export interface ComplianceConfig {
  standards: string[];
  auditing: boolean;
  reporting: boolean;
  retention: string;
}