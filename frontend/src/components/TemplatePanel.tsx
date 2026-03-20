import { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import {
  createTemplate,
  updateTemplate as apiUpdateTemplate,
  listTemplates,
  deleteTemplate as apiDeleteTemplate,
  testExtraction,
} from '../api/client';
import RulesEditor from './RulesEditor';
import ChainEditor from './ChainEditor';
import ComparisonFieldsPanel from './ComparisonFieldsPanel';

export default function TemplatePanel() {
  const fields = useAppStore((s) => s.fields);
  const templates = useAppStore((s) => s.templates);
  const setTemplates = useAppStore((s) => s.setTemplates);
  const loadTemplate = useAppStore((s) => s.loadTemplate);
  const editTemplate = useAppStore((s) => s.editTemplate);
  const activeTemplateId = useAppStore((s) => s.activeTemplateId);
  const pdfId = useAppStore((s) => s.pdfId);
  const pdfIdB = useAppStore((s) => s.pdfIdB);
  const currentPage = useAppStore((s) => s.currentPage);
  const currentPageB = useAppStore((s) => s.currentPageB);
  const setExtractionResults = useAppStore((s) => s.setExtractionResults);
  const removeField = useAppStore((s) => s.removeField);
  const drawMode = useAppStore((s) => s.drawMode);
  const setDrawMode = useAppStore((s) => s.setDrawMode);
  const pendingAnchor = useAppStore((s) => s.pendingAnchor);
  const setPendingAnchor = useAppStore((s) => s.setPendingAnchor);
  const updateFieldLabel = useAppStore((s) => s.updateFieldLabel);
  const editingFieldId = useAppStore((s) => s.editingFieldId);
  const setEditingFieldId = useAppStore((s) => s.setEditingFieldId);
  const templateMode = useAppStore((s) => s.templateMode);
  const setTemplateMode = useAppStore((s) => s.setTemplateMode);

  const [saving, setSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false); // editing an existing template
  const [renamingFieldId, setRenamingFieldId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [comparisonTab, setComparisonTab] = useState<'fields' | 'connections'>('fields');

  const pageFields = fields.filter((f) => {
    const page = (f.source ?? 'a') === 'b' ? currentPageB : currentPage;
    return f.value_region.page === page || (f.anchor_region && f.anchor_region.page === page);
  });

  // Mode logic:
  // - Testing: activeTemplateId set + !isEditing
  // - Editing existing: activeTemplateId set + isEditing
  // - Creating new: activeTemplateId null
  const isTestingMode = activeTemplateId !== null && !isEditing;
  const isEditMode = activeTemplateId !== null && isEditing;
  const isCreateMode = activeTemplateId === null;
  const canEditFields = isCreateMode || isEditMode;
  const activeTemplate = templates.find((t) => t.id === activeTemplateId);
  const setCanDrawFields = useAppStore((s) => s.setCanDrawFields);

  // Sync canDrawFields to store so BboxCanvas knows whether to allow drawing
  useEffect(() => {
    setCanDrawFields(canEditFields);
  }, [canEditFields, setCanDrawFields]);

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch(() => {});
  }, [setTemplates]);

  const handleSaveNew = async () => {
    if (fields.length === 0) return;
    const name = window.prompt('Template name:');
    if (!name || !name.trim()) return;
    setSaving(true);
    try {
      await createTemplate(name.trim(), fields, templateMode);
      const updated = await listTemplates();
      setTemplates(updated);
    } catch {
      alert('Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!activeTemplateId || fields.length === 0) return;
    const currentName = activeTemplate?.name ?? '';
    const name = window.prompt('Template name:', currentName);
    if (!name || !name.trim()) return;
    setSaving(true);
    try {
      await apiUpdateTemplate(activeTemplateId, name.trim(), fields, templateMode);
      const updated = await listTemplates();
      setTemplates(updated);
      setIsEditing(false);
    } catch {
      alert('Failed to update template.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await apiDeleteTemplate(templateId);
      const updated = await listTemplates();
      setTemplates(updated);
      if (activeTemplateId === templateId) {
        handleExitToCreate();
      }
    } catch {
      alert('Failed to delete template.');
    }
  };

  const handleTest = async () => {
    if (!pdfId || fields.length === 0) return;
    if (templateMode === 'comparison' && !pdfIdB) {
      alert('Please select PDF B for comparison mode.');
      return;
    }
    setIsTesting(true);
    setExtractionResults(null);
    try {
      const response = await testExtraction(pdfId, fields, templateMode === 'comparison' ? (pdfIdB ?? undefined) : undefined);
      setExtractionResults(response.results);
    } catch {
      alert('Test failed.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleExitToCreate = () => {
    useAppStore.setState({
      activeTemplateId: null,
      fields: [],
      extractionResults: null,
      pendingAnchor: null,
    });
    setIsEditing(false);
  };

  const handleEditTemplate = (t?: typeof activeTemplate) => {
    const template = t ?? activeTemplate;
    if (!template) return;
    editTemplate(template);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    // Reload the original template to discard changes
    if (activeTemplate) {
      loadTemplate(activeTemplate);
    }
    setIsEditing(false);
  };

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Mode indicator */}
      <div className={`px-4 py-3 border-b flex-shrink-0 ${
        isTestingMode
          ? 'bg-violet-50 border-violet-200'
          : isEditMode
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-blue-50 border-blue-200'
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isTestingMode ? 'bg-violet-500' : isEditMode ? 'bg-emerald-500' : 'bg-blue-500'
          }`} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${
            isTestingMode ? 'text-violet-700' : isEditMode ? 'text-emerald-700' : 'text-blue-700'
          }`}>
            {isTestingMode ? 'Testing Mode' : isEditMode ? 'Editing Template' : 'Create Template'}
          </span>
        </div>
        {(isTestingMode || isEditMode) && activeTemplate && (
          <div className="mt-1.5 flex items-center justify-between">
            <span className={`text-xs font-medium truncate ${
              isTestingMode ? 'text-violet-600' : 'text-emerald-600'
            }`}>
              {activeTemplate.name}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {isTestingMode && (
                <button
                  onClick={() => handleEditTemplate()}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 font-medium"
                >
                  Edit
                </button>
              )}
              {isEditMode && (
                <button
                  onClick={handleCancelEdit}
                  className="text-[10px] text-gray-500 hover:text-gray-700 font-medium"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleExitToCreate}
                className={`text-[10px] underline ${
                  isTestingMode ? 'text-violet-500 hover:text-violet-700' : 'text-emerald-500 hover:text-emerald-700'
                }`}
              >
                Exit
              </button>
            </div>
          </div>
        )}
        {isCreateMode && (
          <p className="text-[11px] text-blue-600 mt-1">
            Draw fields on the PDF, add rules, then save
          </p>
        )}
        {isEditMode && (
          <p className="text-[11px] text-emerald-600 mt-1">
            Modify fields and rules, then save changes
          </p>
        )}
      </div>

      {/* Template mode toggle (Single / Comparison) — only in create/edit mode */}
      {canEditFields && (
        <div className="p-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Template Mode
          </p>
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button
              onClick={() => setTemplateMode('single')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                templateMode === 'single'
                  ? 'bg-gray-700 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Single
            </button>
            <button
              onClick={() => setTemplateMode('comparison')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                templateMode === 'comparison'
                  ? 'bg-violet-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Comparison
            </button>
          </div>
        </div>
      )}

      {/* Draw mode toggle — only in create/edit mode */}
      {canEditFields && (
        <div className="p-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Draw Mode
          </p>
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button
              onClick={() => setDrawMode('static')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                drawMode === 'static'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Static
            </button>
            <button
              onClick={() => setDrawMode('dynamic')}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                drawMode === 'dynamic'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Dynamic
            </button>
          </div>

          {pendingAnchor && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800 font-medium">
                Now draw the value region for this field
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                Anchor: &quot;{pendingAnchor.expectedText}&quot;
              </p>
              <button
                onClick={() => setPendingAnchor(null)}
                className="mt-1.5 text-xs text-amber-700 underline hover:text-amber-900"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fields header + comparison tab switcher */}
      <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
            Fields
          </h2>
          <span className="text-[10px] text-gray-400">{pageFields.length} / {fields.length} field{fields.length !== 1 ? 's' : ''}</span>
        </div>
        {templateMode === 'comparison' && (
          <div className="flex mt-2 rounded-lg overflow-hidden border border-gray-200">
            <button
              onClick={() => setComparisonTab('fields')}
              className={`flex-1 py-1 text-[10px] font-medium transition-colors ${
                comparisonTab === 'fields'
                  ? 'bg-gray-700 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              Fields
            </button>
            <button
              onClick={() => setComparisonTab('connections')}
              className={`flex-1 py-1 text-[10px] font-medium transition-colors ${
                comparisonTab === 'connections'
                  ? 'bg-violet-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              Connections
            </button>
          </div>
        )}
      </div>

      {/* Fields list — connections tab in comparison mode, or normal field list */}
      {templateMode === 'comparison' && comparisonTab === 'connections' ? (
        <ComparisonFieldsPanel />
      ) : (
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {pageFields.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            {isTestingMode
              ? 'No fields on this page.'
              : fields.length === 0
                ? 'No fields yet. Draw on the PDF to add fields.'
                : 'No fields on this page.'}
          </p>
        ) : (
          pageFields.map((field, i) => (
            <div
              key={field.id}
              className={`group/field rounded-lg text-xs transition-colors cursor-pointer ${
                editingFieldId === field.id
                  ? 'bg-indigo-50 border border-indigo-300 ring-1 ring-indigo-200'
                  : field.value_region.page === currentPage
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-gray-50 border border-gray-100'
              }`}
              onClick={() => setExpandedFieldId(expandedFieldId === field.id ? null : field.id)}
            >
              <div className="flex items-center justify-between px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold ${
                      field.type === 'static' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {field.type === 'static' ? 'S' : 'D'}
                    </span>
                    {renamingFieldId === field.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          if (renameDraft.trim() && renameDraft.trim() !== field.label) {
                            updateFieldLabel(field.id, renameDraft.trim());
                          }
                          setRenamingFieldId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            if (renameDraft.trim() && renameDraft.trim() !== field.label) {
                              updateFieldLabel(field.id, renameDraft.trim());
                            }
                            setRenamingFieldId(null);
                          }
                          if (e.key === 'Escape') setRenamingFieldId(null);
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-gray-800 bg-white border border-indigo-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400 w-full text-xs"
                      />
                    ) : (
                      <span className="font-medium text-gray-800 truncate">
                        {i + 1}. {field.label}
                      </span>
                    )}
                    {renamingFieldId !== field.id && (field.chain?.length > 0) && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded" title="Chain steps">
                        ⛓ {field.chain.length}
                      </span>
                    )}
                    {renamingFieldId !== field.id && field.rules.length > 0 && !field.chain?.length && (
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded">
                        {field.rules.length}
                      </span>
                    )}
                    {renamingFieldId !== field.id && field.value_format && field.value_format !== 'string' && (
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-1 rounded">
                        {field.value_format}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-gray-400">
                    Page {field.value_region.page}
                    {field.type === 'dynamic' && field.expected_anchor_text && (
                      <span className="ml-1 text-amber-500">
                        | &quot;{field.expected_anchor_text}&quot;
                      </span>
                    )}
                  </div>
                </div>
                {canEditFields && (
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFieldId(field.id);
                        setRenameDraft(field.label);
                        setRenamingFieldId(field.id);
                      }}
                      className="text-gray-300 hover:text-indigo-500 transition-colors opacity-0 group-hover/field:opacity-100"
                      title="Edit field"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                      className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/field:opacity-100"
                      title="Remove"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              {canEditFields && expandedFieldId === field.id && (
                <div className="px-3 pb-2 border-t border-gray-100 pt-1.5">
                  <ChainEditor field={field} />
                  {(!field.chain || field.chain.length === 0) && (
                    <RulesEditor field={field} />
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      )}

      {/* Bottom actions */}
      {isTestingMode ? (
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleTest}
            disabled={!pdfId || fields.length === 0 || isTesting}
            className="w-full py-2.5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isTesting ? 'Testing...' : 'Run Test'}
          </button>
          <p className="text-[10px] text-gray-400 text-center mt-1.5">
            Validates this PDF against template rules
          </p>
        </div>
      ) : (
        <>
          {/* Save / Update button */}
          <div className="p-3 border-t border-gray-100 space-y-2">
            {isEditMode ? (
              <>
                <button
                  onClick={handleUpdate}
                  disabled={fields.length === 0 || saving}
                  className="w-full py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Update Template'}
                </button>
                <button
                  onClick={handleSaveNew}
                  disabled={fields.length === 0 || saving}
                  className="w-full py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Save as New Template
                </button>
              </>
            ) : (
              <button
                onClick={handleSaveNew}
                disabled={fields.length === 0 || saving}
                className="w-full py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save as Template'}
              </button>
            )}
          </div>

          {/* Saved templates */}
          {!isEditMode && (
            <div className="border-t border-gray-100">
              <div className="px-4 py-3 pb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                  Templates
                </h2>
                <span className="text-[10px] text-gray-400">{templates.length}</span>
              </div>
              <div className="overflow-y-auto max-h-48 px-3 pb-3 space-y-1.5">
                {templates.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">No templates saved yet.</p>
                ) : (
                  templates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors bg-gray-50 border border-gray-100 hover:bg-violet-50 hover:border-violet-200"
                      onClick={() => loadTemplate(t)}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-800 block truncate">{t.name}</span>
                        <span className="text-gray-400">{t.fields.length} fields</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditTemplate(t); }}
                          className="text-[10px] text-emerald-600 hover:text-emerald-800 font-medium px-1"
                          title="Edit template"
                        >
                          Edit
                        </button>
                        <span className="text-gray-300">|</span>
                        <span className="text-[10px] text-violet-600 font-medium px-1">Test</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(t.id);
                          }}
                          className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete template"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
