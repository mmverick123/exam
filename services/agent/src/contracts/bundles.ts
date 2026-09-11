import {
  CONTRACT_VERSION,
  formConfigSchema,
  getWidgetDefinition,
  isContainer,
  outlineForAgent,
  registry,
  validate,
  widgetDefinitions,
  type JSONSchema,
} from '@exam/lowcode/contract';

export interface ContractBundle {
  contractVersion: string;
  widgets: typeof widgetDefinitions;
  registry: typeof registry;
  formConfigSchema: JSONSchema;
  validate: typeof validate;
}

export class UnsupportedContractVersionError extends Error {
  readonly code = 'UNSUPPORTED_CONTRACT_VERSION';
  constructor(readonly requestedVersion: string) {
    super(`该题型的契约版本 ${requestedVersion} 已超出 Agent 支持范围`);
  }
}

export function buildContractBundles(): Map<string, ContractBundle> {
  return new Map([[CONTRACT_VERSION, {
    contractVersion: CONTRACT_VERSION,
    widgets: widgetDefinitions,
    registry,
    formConfigSchema,
    validate,
  }]]);
}

export class ContractAdapter {
  constructor(readonly bundle: ContractBundle) {}

  agentWidgetList() {
    return this.bundle.widgets
      .filter((widget) => !widget.agentExcluded)
      .map((widget) => ({
        type: widget.type,
        displayName: widget.displayName,
        aiHint: widget.aiHint,
        componentType: widget.componentType,
        ...(widget.allowedChildTypes ? { allowedChildTypes: widget.allowedChildTypes } : {}),
      }));
  }

  optionsSchema(type: string): JSONSchema | undefined {
    return this.bundle.registry[type]?.optionsSchema;
  }

  defaultOptions(type: string) {
    return this.bundle.registry[type]?.defaultOptions;
  }

  isContainer(type: string) { return isContainer(type); }
  outline = outlineForAgent;
}

export function resolveBundle(
  version: string,
  bundles = buildContractBundles(),
): ContractAdapter {
  const bundle = bundles.get(version);
  if (!bundle) throw new UnsupportedContractVersionError(version);
  return new ContractAdapter(bundle);
}

export function resolveWidget(type: string) {
  return getWidgetDefinition(type);
}
