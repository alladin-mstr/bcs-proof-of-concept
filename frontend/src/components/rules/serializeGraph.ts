/**
 * Converts React Flow nodes + edges into TemplateRule[] and ComputedField[]
 * that the backend rule engine can evaluate.
 *
 * Every Math, Compare, and Validation node can be named directly (via outputLabel).
 * An Output node is optional — it just provides an explicit name/passthrough.
 */
import type { Node, Edge } from '@xyflow/react';
import type { TemplateRule, ComputedField, RuleOperand, RuleNodeData, CompareOperator, MathOperation, AggregateOperation, RowFilterMode, Condition, PolarisConfig } from '../../types';

function incomingEdges(edges: Edge[], nodeId: string, handleId?: string): Edge[] {
  return edges.filter(
    (e) => e.target === nodeId && (handleId === undefined || e.targetHandle === handleId)
  );
}

function operandFromNode(node: Node | undefined): RuleOperand | null {
  if (!node) return null;
  const data = node.data as RuleNodeData;

  if (node.type === 'field_input') {
    return { type: 'field_ref' as const, ref: data.fieldRef ?? { field_label: data.label } };
  }
  if (node.type === 'literal_input') {
    return { type: 'literal' as const, value: data.literalValue ?? '', datatype: data.literalDatatype };
  }
  if (node.type === 'global_value_input') {
    return {
      type: 'global_value' as const,
      global_group_id: data.globalGroupId ?? '',
      global_value_id: data.globalValueId ?? '',
    };
  }
  if (node.type === 'table_column') {
    return {
      type: 'column_ref' as const,
      ref: data.tableFieldRef ?? { field_label: data.label },
      column_label: data.tableColumnLabel ?? '',
    };
  }
  if (node.type === 'math_operation' || node.type === 'comparison' || node.type === 'condition'
    || node.type === 'table_aggregate' || node.type === 'table_row_filter') {
    return { type: 'computed_ref' as const, computed_id: node.id };
  }
  if (node.type === 'formula') {
    return { type: 'computed_ref' as const, computed_id: node.id };
  }
  if (node.type === 'cell_range') {
    return { type: 'computed_ref' as const, computed_id: node.id };
  }
  if (node.type === 'polaris_lookup') {
    return { type: 'computed_ref' as const, computed_id: node.id };
  }
  return null;
}

function outgoingTarget(nodes: Node[], edges: Edge[], sourceNodeId: string, sourceHandleId?: string): Node | undefined {
  const edge = edges.find(
    (e) => e.source === sourceNodeId && (sourceHandleId === undefined || e.sourceHandle === sourceHandleId)
  );
  if (!edge) return undefined;
  return nodes.find((n) => n.id === edge.target);
}

function sourceNode(nodes: Node[], edges: Edge[], targetNodeId: string, handleId?: string): Node | undefined {
  const edge = incomingEdges(edges, targetNodeId, handleId)[0];
  if (!edge) return undefined;
  return nodes.find((n) => n.id === edge.source);
}

function getTwoOperands(nodes: Node[], edges: Edge[], nodeId: string): { a: RuleOperand | null; b: RuleOperand | null } {
  const srcA = sourceNode(nodes, edges, nodeId, 'a');
  const srcB = sourceNode(nodes, edges, nodeId, 'b');
  if (srcA || srcB) {
    return { a: operandFromNode(srcA), b: operandFromNode(srcB) };
  }
  const incoming = incomingEdges(edges, nodeId);
  const first = incoming[0] ? nodes.find((n) => n.id === incoming[0].source) : undefined;
  const second = incoming[1] ? nodes.find((n) => n.id === incoming[1].source) : undefined;
  return { a: operandFromNode(first), b: operandFromNode(second) };
}

function getAllOperands(nodes: Node[], edges: Edge[], nodeId: string): RuleOperand[] {
  return incomingEdges(edges, nodeId)
    .map((e) => operandFromNode(nodes.find((n) => n.id === e.source)))
    .filter((op): op is RuleOperand => op !== null);
}

/** Get the effective name for a node — its own outputLabel or a fallback */
function getNodeName(data: RuleNodeData, fallback: string): string {
  if (data.outputLabel) return data.outputLabel;
  return fallback;
}

function getOperandLabel(op: RuleOperand): string {
  if (op.type === 'field_ref') return op.ref?.field_label ?? '?';
  if (op.type === 'literal') return op.value ?? '?';
  if (op.type === 'computed_ref') return `[${op.computed_id?.slice(0, 6)}]`;
  if (op.type === 'global_value') return `[global:${(op as any).global_value_id?.slice(0, 6)}]`;
  if (op.type === 'column_ref') return `${op.ref?.field_label ?? '?'}.${op.column_label}`;
  return '?';
}

export function serializeGraph(
  nodes: Node[],
  edges: Edge[],
  templateId: string,
): { rules: TemplateRule[]; computedFields: ComputedField[] } {
  const rules: TemplateRule[] = [];
  const computedFields: ComputedField[] = [];

  for (const node of nodes) {
    const data = node.data as RuleNodeData;

    if (node.type === 'comparison') {
      const { a, b } = getTwoOperands(nodes, edges, node.id);
      if (!a) continue;

      const operator = (data.comparisonOperator ?? 'equals') as CompareOperator;
      const name = getNodeName(data,`${getOperandLabel(a)} ${operator} ${b ? getOperandLabel(b) : '?'}`);

      rules.push({
        id: node.id,
        name,
        type: 'validation',
        enabled: true,
        validation: {
          rule_type: 'compare_field',
          operand_a: a,
          operand_b: b ?? undefined,
          operator,
        },
      });

      // If named, also register as a computed field so other templates can reference it
      if (data.outputLabel) {
        computedFields.push({
          id: node.id,
          label: name,
          template_id: templateId,
          rule_id: node.id,
        });
      }
    }

    if (node.type === 'validation') {
      const src = sourceNode(nodes, edges, node.id);
      const a = operandFromNode(src);
      if (!a) continue;

      const ruleType = data.validationRuleType ?? 'not_empty';
      const name = getNodeName(data,`${getOperandLabel(a)}: ${ruleType}`);

      rules.push({
        id: node.id,
        name,
        type: 'validation',
        enabled: true,
        validation: {
          rule_type: ruleType as TemplateRule['validation'] extends { rule_type: infer T } ? T : string,
          operand_a: a,
          ...(data.validationConfig ?? {}),
        },
      });

      if (data.outputLabel) {
        computedFields.push({
          id: node.id,
          label: name,
          template_id: templateId,
          rule_id: node.id,
        });
      }
    }

    if (node.type === 'math_operation') {
      const operands = getAllOperands(nodes, edges, node.id);
      if (operands.length === 0) continue;

      const operation = (data.mathOperation ?? 'add') as MathOperation;
      const name = getNodeName(data,`${operation}(...)`);

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation,
          operands,
          output_label: name,
          output_datatype: data.outputDatatype,
        },
      });

      // Always register math nodes as computed fields (they produce values)
      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
        datatype: data.outputDatatype,
      });
    }

    if (node.type === 'table_aggregate') {
      const src = sourceNode(nodes, edges, node.id);
      if (!src) continue;

      const srcData = src.data as RuleNodeData;
      let operand: RuleOperand | null = null;

      // If source is a table field_input, build a column_ref using selectedColumnLabel
      if (src.type === 'field_input' && srcData.fieldType === 'table' && data.selectedColumnLabel) {
        operand = {
          type: 'column_ref' as const,
          ref: srcData.fieldRef ?? { field_label: srcData.label },
          column_label: data.selectedColumnLabel,
        };
      } else {
        operand = operandFromNode(src);
      }
      if (!operand) continue;

      const aggOp = (data.aggregateOperation ?? 'sum') as AggregateOperation;
      const name = getNodeName(data, `agg_${aggOp}(...)`);

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: `agg_${aggOp}` as MathOperation,
          operands: [operand],
          output_label: name,
          output_datatype: data.outputDatatype,
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
        datatype: data.outputDatatype,
      });
    }

    if (node.type === 'table_row_filter') {
      const colSrc = sourceNode(nodes, edges, node.id, 'column');
      const condSrc = sourceNode(nodes, edges, node.id, 'condition');

      let colOp: RuleOperand | null = null;
      if (colSrc) {
        const colSrcData = colSrc.data as RuleNodeData;
        if (colSrc.type === 'field_input' && colSrcData.fieldType === 'table' && data.selectedColumnLabel) {
          colOp = {
            type: 'column_ref' as const,
            ref: colSrcData.fieldRef ?? { field_label: colSrcData.label },
            column_label: data.selectedColumnLabel,
          };
        } else {
          colOp = operandFromNode(colSrc);
        }
      }
      if (!colOp) continue;

      const mode = (data.rowFilterMode ?? 'count') as RowFilterMode;
      const name = getNodeName(data, `row_filter(${mode})`);

      // Build condition from the connected comparison node
      let condition: Condition | null = null;
      if (condSrc?.type === 'comparison') {
        const condData = condSrc.data as RuleNodeData;
        const { a, b } = getTwoOperands(nodes, edges, condSrc.id);
        if (a && b) {
          condition = {
            operand_a: a,
            operator: (condData.comparisonOperator ?? 'equals') as CompareOperator,
            operand_b: b,
            then_value: { type: 'literal', value: 'true' },
            else_value: { type: 'literal', value: 'false' },
          };
        }
      }

      if (!condition) continue;

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: 'row_filter',
          operands: [colOp],
          output_label: name,
          output_datatype: data.outputDatatype,
          condition,
          row_filter_mode: mode,
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
        datatype: data.outputDatatype,
      });
    }

    if (node.type === 'formula') {
      const name = getNodeName(data, `formula(${(data.formulaExpression || '').slice(0, 20)})`);
      const spreadsheetId = data.spreadsheetId || '';

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: 'add' as MathOperation,
          operands: [{
            type: 'formula',
            expression: data.formulaExpression || '',
            spreadsheet_id: spreadsheetId,
          } as unknown as RuleOperand],
          output_label: name,
          output_datatype: data.outputDatatype,
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
        datatype: data.outputDatatype,
      });
    }

    if (node.type === 'cell_range') {
      const name = getNodeName(data, `range(${data.rangeExpression || '?'})`);
      const spreadsheetId = data.spreadsheetId || '';

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: 'sum' as MathOperation,
          operands: [{
            type: 'range_ref',
            spreadsheet_id: spreadsheetId,
            range: data.cellRange || { startCol: 0, startRow: 0, endCol: 0, endRow: 0 },
          } as unknown as RuleOperand],
          output_label: name,
          output_datatype: data.outputDatatype,
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
        datatype: data.outputDatatype,
      });
    }

    if (node.type === 'condition') {
      // 3 input handles: "test" (condition), "true_val" (then value), "false_val" (else value)
      // 1 output handle: "result"
      const condSource = sourceNode(nodes, edges, node.id, 'test');

      const trueSource = sourceNode(nodes, edges, node.id, 'true_val');
      const falseSource = sourceNode(nodes, edges, node.id, 'false_val');
      const thenOp = operandFromNode(trueSource);
      const elseOp = operandFromNode(falseSource);

      // Build the inline Condition from the connected comparison node
      let condition: Condition | null = null;

      if (condSource?.type === 'comparison') {
        const condData = condSource.data as RuleNodeData;
        const { a, b } = getTwoOperands(nodes, edges, condSource.id);
        if (a && b) {
          condition = {
            operand_a: a,
            operator: (condData.comparisonOperator ?? 'equals') as CompareOperator,
            operand_b: b,
            then_value: thenOp ?? { type: 'literal', value: '' },
            else_value: elseOp ?? { type: 'literal', value: '' },
          };
        }
      } else if (condSource) {
        // Non-comparison source: treat as "!= 0" truthy check
        const condOp = operandFromNode(condSource);
        if (condOp) {
          condition = {
            operand_a: condOp,
            operator: 'not_equals' as CompareOperator,
            operand_b: { type: 'literal', value: '0' },
            then_value: thenOp ?? { type: 'literal', value: '' },
            else_value: elseOp ?? { type: 'literal', value: '' },
          };
        }
      }

      if (!condition) continue;

      const name = getNodeName(data,'if/else');

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: 'add',
          operands: [],
          output_label: name,
          output_datatype: data.outputDatatype,
          condition,
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
        datatype: data.outputDatatype,
      });
    }

    if (node.type === 'polaris_lookup') {
      const name = getNodeName(data, 'Polaris Lookup');
      const ssId = data.polarisSpreadsheetId || '';
      const keyCol = data.polarisKeyColumn || '';
      const sigCol = data.polarisSignalColumn || '';

      if (!ssId || !keyCol || !sigCol) continue;

      rules.push({
        id: node.id,
        name,
        type: 'computation',
        enabled: true,
        computation: {
          operation: 'polaris_lookup',
          operands: [],
          output_label: name,
          polaris_config: {
            spreadsheet_id: ssId,
            key_column: keyCol,
            signal_column: sigCol,
          },
        },
      });

      computedFields.push({
        id: node.id,
        label: name,
        template_id: templateId,
        rule_id: node.id,
      });
    }
  }

  return { rules, computedFields };
}

