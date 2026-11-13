import * as React from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Edit3, LayoutTemplate, Plus, Trash2 } from 'lucide-react';
import { repository } from '@/src/features/storage/repository';
import { generateId } from '@/src/lib/utils';
import type { BoardType, TemplateRecord } from '@/src/lib/zod-schemas';
import { useUIStore } from '@/src/app/store';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  MetaLine,
  Modal,
  Select,
} from '@/src/components/ui';
import { calculateBlueprintSummary, createBlankBlueprint } from './blueprint-engine';
import { BlueprintEditor } from './BlueprintEditor';

const EMPTY_TEMPLATES: TemplateRecord[] = [];

export function TemplatesPage() {
  const templates = useLiveQuery(() => repository.papersRepo.listTemplates(), [], EMPTY_TEMPLATES);
  const settings = useLiveQuery(() => repository.settingsRepo.get(), []);
  const addToast = useUIStore((s) => s.addToast);

  const [boardFilter, setBoardFilter] = React.useState<'ALL' | BoardType>('ALL');
  const [editingTemplate, setEditingTemplate] = React.useState<TemplateRecord | null>(null);
  const [saving, setSaving] = React.useState(false);

  const filtered = React.useMemo(() => {
    if (boardFilter === 'ALL') return templates;
    return templates.filter((t) => t.board === boardFilter);
  }, [templates, boardFilter]);

  const handleCloneTemplate = async (tpl: TemplateRecord) => {
    const cloned = await repository.papersRepo.cloneTemplate(tpl);
    addToast({ title: 'Template cloned', description: cloned.name, variant: 'success' });
    setEditingTemplate(cloned);
  };

  const handleCreateCustom = () => {
    const now = Date.now();
    const bp = createBlankBlueprint({
      schoolName: settings?.schoolName,
      board: settings?.defaultBoard,
      classLevel: settings?.defaultClassLevel,
      subject: settings?.defaultSubject,
      language: settings?.language,
    });
    setEditingTemplate({
      id: generateId('tpl'),
      name: 'Custom School Blueprint',
      description: 'Teacher-authored custom exam blueprint.',
      board: bp.header.board,
      classLevel: bp.header.classLevel,
      subject: bp.header.subject,
      isBuiltIn: false,
      blueprint: bp,
      createdAt: now,
      updatedAt: now,
    });
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    const summary = calculateBlueprintSummary(editingTemplate.blueprint);
    if (!summary.isValid) {
      addToast({
        title: 'Please fix blueprint validation errors before saving',
        description: summary.errors[0],
        variant: 'danger',
      });
      return;
    }

    setSaving(true);
    try {
      const saved = await repository.papersRepo.saveTemplate({
        ...editingTemplate,
        board: editingTemplate.blueprint.header.board,
        classLevel: editingTemplate.blueprint.header.classLevel,
        subject: editingTemplate.blueprint.header.subject,
        blueprint: {
          ...editingTemplate.blueprint,
          totalMarks: summary.totalMarks,
        },
        updatedAt: Date.now(),
      });
      addToast({ title: 'Template saved locally', description: saved.name, variant: 'success' });
      setEditingTemplate(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Board Blueprint Templates
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Verified CBSE, ICSE, and Maharashtra State Board patterns plus your custom blueprints.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Select
            value={boardFilter}
            onValueChange={(v) => setBoardFilter(v as 'ALL' | BoardType)}
            ariaLabel="Filter templates by board"
            className="w-44"
            options={[
              { value: 'ALL', label: 'All Boards' },
              { value: 'CBSE', label: 'CBSE' },
              { value: 'ICSE', label: 'ICSE' },
              { value: 'MAHARASHTRA', label: 'Maharashtra SSC/HSC' },
              { value: 'OTHER', label: 'Other' },
            ]}
          />
          <Button size="sm" onClick={handleCreateCustom} leftIcon={<Plus className="h-4 w-4" />}>
            New Custom Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {filtered.map((tpl) => (
          <Card key={tpl.id} className="flex flex-col justify-between">
            <CardContent className="space-y-3 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)]">
                    <LayoutTemplate className="h-4 w-4" />
                  </div>
                  <Badge tone={tpl.isBuiltIn ? 'brand' : 'neutral'}>
                    {tpl.isBuiltIn ? 'Built-in' : 'Custom'}
                  </Badge>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">{tpl.name}</h2>
                  <MetaLine
                    className="mt-1"
                    items={[
                      tpl.board,
                      `Class ${tpl.classLevel}`,
                      `${tpl.blueprint.totalMarks} Marks`,
                      `${tpl.blueprint.sections.length} sections`,
                    ]}
                  />
                  <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                    {tpl.description}
                  </p>
                </div>
              </div>

              <div className="pt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)]">
                <Link to={`/app/create?templateId=${encodeURIComponent(tpl.id)}`}>
                  <Button size="sm">Use Template</Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCloneTemplate(tpl)}
                  leftIcon={<Copy className="h-3.5 w-3.5" />}
                >
                  Clone
                </Button>
                {!tpl.isBuiltIn && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Edit template"
                      onClick={() => setEditingTemplate(tpl)}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete template"
                      onClick={() => void repository.papersRepo.deleteTemplate(tpl.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Custom Template Editor Modal */}
      <Modal
        open={Boolean(editingTemplate)}
        onOpenChange={(open) => !open && setEditingTemplate(null)}
        title={editingTemplate ? `Edit Template — ${editingTemplate.name}` : 'Edit Template'}
        description="Customize sections, choice rules, marks weightage, and board headers."
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(null)}>
              Cancel
            </Button>
            <Button size="sm" loading={saving} onClick={() => void handleSaveTemplate()}>
              Save Custom Template
            </Button>
          </>
        }
      >
        {editingTemplate && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="tpl-name">Template Name</Label>
                <Input
                  id="tpl-name"
                  value={editingTemplate.name}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="tpl-desc">Short Description</Label>
                <Input
                  id="tpl-desc"
                  value={editingTemplate.description}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, description: e.target.value })
                  }
                />
              </div>
            </div>

            <BlueprintEditor
              blueprint={editingTemplate.blueprint}
              onChange={(nextBp) => setEditingTemplate({ ...editingTemplate, blueprint: nextBp })}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
