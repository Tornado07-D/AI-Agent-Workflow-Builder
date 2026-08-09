'use client';

import { useQuery, useMutation, useSubscription, gql } from '@apollo/client';
import { useState, useEffect } from 'react';
import { Plus, Play, Pause, Save, CheckCircle, XCircle, Clock, Trash, GripVertical, Edit2 } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const GET_ORG_WORKFLOWS = gql`
  query GetOrgWorkflows($org_id: uuid!) {
    organizations_by_pk(id: $org_id) {
      id name quota_calls_used quota_calls_allowed
      workflows(order_by: { created_at: desc }) {
        id name description
        steps(order_by: { step_order: asc }) {
          id step_order type config
        }
        triggers { id type config }
        runs(order_by: { created_at: desc }, limit: 1) {
          id status started_at finished_at
        }
      }
    }
  }
`;

const SAVE_WORKFLOW = gql`
  mutation SaveWorkflowAndSteps(
    $workflow_id: uuid!, $org_id: uuid!, $name: String!, $description: String,
    $steps: [workflow_steps_insert_input!]!, $triggers: [workflow_triggers_insert_input!]!
  ) {
    insert_workflows_one(
      object: { id: $workflow_id, org_id: $org_id, name: $name, description: $description },
      on_conflict: { constraint: workflows_pkey, update_columns: [name, description] }
    ) { id }
    delete_workflow_steps(where: { workflow_id: { _eq: $workflow_id } }) { affected_rows }
    insert_workflow_steps(objects: $steps) { affected_rows }
    delete_workflow_triggers(where: { workflow_id: { _eq: $workflow_id } }) { affected_rows }
    insert_workflow_triggers(objects: $triggers) { affected_rows }
  }
`;

const TRIGGER_RUN = gql`
  mutation TriggerRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) { run_id }
  }
`;

const APPROVE_STEP = gql`
  mutation ApproveStep($step_run_id: uuid!) {
    approveStep(step_run_id: $step_run_id) { success run_id }
  }
`;

const WATCH_STEP_RUNS = gql`
  subscription WatchStepRuns($run_id: uuid!) {
    workflow_runs_by_pk(id: $run_id) {
      id status started_at finished_at
      step_runs(order_by: { created_at: asc }) {
        id workflow_step_id status input output error attempt_count approved_by approved_at
      }
    }
  }
`;

export function WorkflowBuilder({ org }: { org: any }) {
  const { data, loading, refetch } = useQuery(GET_ORG_WORKFLOWS, { 
    variables: { org_id: org?.id }, 
    skip: !org?.id,
    fetchPolicy: 'network-only',
    errorPolicy: 'ignore' // Prevents unhandled promise rejections on Apollo store resets
  });
  const [saveWf] = useMutation(SAVE_WORKFLOW);
  const [triggerRun] = useMutation(TRIGGER_RUN);
  
  const organization = data?.organizations_by_pk;
  const workflows = organization?.workflows || [];
  
  const [selectedWfId, setSelectedWfId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSteps, setEditingSteps] = useState<any[]>([]);
  
  const selectedWf = workflows.find((w: any) => w.id === selectedWfId) || null;

  useEffect(() => {
    if (workflows.length > 0 && !selectedWfId) {
      setSelectedWfId(workflows[0].id);
    }
  }, [workflows, selectedWfId]);

  useEffect(() => {
    if (selectedWf && !isEditing) {
      // Map steps to have a unique string id for dnd-kit if they don't have one
      setEditingSteps(selectedWf.steps.map((s: any, idx: number) => ({
        ...s,
        id: s.id || `temp-${idx}`,
        // ensure config is an object
        config: typeof s.config === 'string' ? JSON.parse(s.config) : s.config
      })));
    }
  }, [selectedWf, isEditing]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setEditingSteps((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleAddStep = (type: string) => {
    const newStep = {
      id: `new-${Date.now()}`,
      type,
      config: {},
    };
    setEditingSteps([...editingSteps, newStep]);
  };

  const handleRemoveStep = (id: string) => {
    setEditingSteps(editingSteps.filter(s => s.id !== id));
  };

  const handleUpdateStepConfig = (id: string, newConfigStr: string) => {
    try {
      const parsed = JSON.parse(newConfigStr);
      setEditingSteps(editingSteps.map(s => s.id === id ? { ...s, config: parsed } : s));
    } catch (e) {
      // Invalid JSON, maybe just store it as string temporarily or ignore until valid
    }
  };

  const handleSave = async () => {
    try {
      // Reassign step_order based on array index
      const stepsToSave = editingSteps.map((s, idx) => ({
        workflow_id: selectedWf.id,
        step_order: idx + 1,
        type: s.type,
        config: s.config
      }));

      // Assuming triggers haven't changed in this UI, we just rewrite them as is
      const triggersToSave = selectedWf.triggers.map((t: any) => ({
        workflow_id: selectedWf.id,
        type: t.type,
        config: t.config
      }));

      await saveWf({
        variables: {
          workflow_id: selectedWf.id,
          org_id: org.id,
          name: selectedWf.name,
          description: selectedWf.description,
          steps: stepsToSave,
          triggers: triggersToSave
        }
      });
      setIsEditing(false);
      refetch();
    } catch (e: any) {
      alert("Error saving workflow: " + e.message);
    }
  };

  if (loading) return <div>Loading workflows...</div>;
  if (workflows.length === 0) return <div>No workflows found in this org.</div>;

  const runInfo = selectedWf?.runs?.[0];

  const handleRun = async () => {
    try {
      await triggerRun({ variables: { workflow_id: selectedWf.id } });
      refetch();
    } catch (e: any) {
      alert("Error triggering run: " + e.message);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-6 h-full">
      <div className="col-span-1 bg-slate-950 rounded-lg p-5 border border-slate-800 overflow-auto">
        <h2 className="text-xl font-bold mb-4">Workflows</h2>
        <div className="space-y-2">
          {workflows.map((wf: any) => (
            <div 
              key={wf.id} 
              onClick={() => { setSelectedWfId(wf.id); setIsEditing(false); }}
              className={`p-4 rounded-md cursor-pointer border transition-colors ${selectedWf?.id === wf.id ? 'bg-slate-900 border-slate-700' : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900'}`}
            >
              <div className="font-semibold">{wf.name}</div>
              <div className="text-xs text-slate-400 mt-1">{wf.description || "No description"}</div>
            </div>
          ))}
        </div>
        
        <div className="mt-8 p-4 bg-slate-900 rounded border border-slate-700">
          <h3 className="text-sm font-semibold mb-2">Usage This Month</h3>
          <div className="w-full bg-slate-800 rounded-full h-2.5">
            <div className="bg-cyan-500 h-2.5 rounded-full" style={{ width: `${Math.min(100, (organization.quota_calls_used / organization.quota_calls_allowed) * 100)}%` }}></div>
          </div>
          <div className="text-xs text-slate-400 mt-2">{organization.quota_calls_used} / {organization.quota_calls_allowed} calls used</div>
        </div>
      </div>
      
      <div className="col-span-2 flex flex-col gap-4">
        {selectedWf && (
          <>
            <div className="bg-slate-950 p-6 rounded-lg border border-slate-800 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedWf.name}</h2>
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="bg-slate-700 px-2 py-1 rounded text-slate-300">
                    Triggers: {selectedWf.triggers.map((t: any) => t.type).join(', ') || 'None'}
                  </span>
                  {selectedWf.average_run_duration && (
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock size={14} /> Avg: {selectedWf.average_run_duration}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {org.role !== 'viewer' && (
                  <>
                    {!isEditing ? (
                      <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded font-semibold transition-colors">
                        <Edit2 size={16} /> Edit
                      </button>
                    ) : (
                      <button onClick={handleSave} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded font-semibold transition-colors">
                        <Save size={16} /> Save Changes
                      </button>
                    )}
                    <button onClick={handleRun} disabled={isEditing} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all transform active:scale-95 ${isEditing ? 'bg-slate-900 cursor-not-allowed text-slate-500 border border-slate-800' : 'bg-white hover:bg-slate-200 active:bg-slate-300 text-slate-900'}`}>
                      <Play size={16} /> Run Now
                    </button>
                  </>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
               <div className="bg-slate-950 rounded-lg p-5 border border-slate-800 overflow-auto flex flex-col">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-200">Steps Definition</h3>
                 </div>
                 
                 {isEditing ? (
                   <div className="flex-1 flex flex-col gap-4">
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={editingSteps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-3 flex-1 overflow-auto pr-2">
                            {editingSteps.map((step, idx) => (
                              <SortableStep 
                                key={step.id} 
                                step={step} 
                                index={idx} 
                                onRemove={() => handleRemoveStep(step.id)}
                                onUpdateConfig={(cfg) => handleUpdateStepConfig(step.id, cfg)}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                      
                      <div className="pt-4 border-t border-slate-700">
                        <h4 className="text-xs font-semibold text-slate-400 mb-2 uppercase">Add Step</h4>
                        <div className="flex flex-wrap gap-2">
                          {['llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate'].map(type => (
                            <button 
                              key={type}
                              onClick={() => handleAddStep(type)}
                              className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-xs px-2 py-1 rounded"
                            >
                              <Plus size={12} /> {type}
                            </button>
                          ))}
                        </div>
                      </div>
                   </div>
                 ) : (
                   <div className="space-y-4 flex-1 overflow-auto">
                     {selectedWf.steps.map((step: any, idx: number) => (
                       <div key={step.id || idx} className="bg-slate-900 p-3 rounded border border-slate-700 relative">
                          <div className="flex items-center gap-2 font-semibold text-cyan-400 mb-2">
                             <div className="w-6 h-6 rounded-full bg-cyan-900 flex items-center justify-center text-xs">{idx + 1}</div>
                             {step.type}
                          </div>
                          <pre className="text-xs text-slate-400 overflow-x-auto p-2 bg-slate-950 rounded">
                             {JSON.stringify(step.config, null, 2)}
                          </pre>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
               
               <div className="bg-slate-950 rounded-lg p-5 border border-slate-800 overflow-auto flex flex-col">
                 <h3 className="font-bold mb-4 text-slate-200 text-sm tracking-tight">Live Execution</h3>
                 {runInfo ? (
                    <LiveRunViewer runId={runInfo.id} orgRole={org.role} />
                  ) : (
                    <div className="text-slate-500 text-sm">No runs yet.</div>
                  )}
               </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SortableStep({ step, index, onRemove, onUpdateConfig }: { step: any, index: number, onRemove: () => void, onUpdateConfig: (cfg: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const [configStr, setConfigStr] = useState(JSON.stringify(step.config, null, 2));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const handleConfigChange = (e: any) => {
    setConfigStr(e.target.value);
    onUpdateConfig(e.target.value);
  };

  return (
    <div ref={setNodeRef} style={style} className={`bg-slate-900 p-3 rounded border ${isDragging ? 'border-cyan-500' : 'border-slate-700'} relative flex gap-2 shadow-lg`}>
      <div {...attributes} {...listeners} className="cursor-grab text-slate-500 hover:text-slate-300 mt-1">
        <GripVertical size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2 font-semibold text-cyan-400">
            <div className="w-5 h-5 rounded-full bg-cyan-900 flex items-center justify-center text-xs">{index + 1}</div>
            {step.type}
          </div>
          <button onClick={onRemove} className="text-slate-500 hover:text-red-400 transition-colors">
            <Trash size={14} />
          </button>
        </div>
        <textarea 
          value={configStr}
          onChange={handleConfigChange}
          className="w-full h-24 bg-slate-950 text-slate-300 text-xs p-2 rounded border border-slate-800 focus:border-cyan-500 outline-none font-mono resize-y"
          placeholder="{}"
          onPointerDown={(e) => e.stopPropagation()} 
        />
      </div>
    </div>
  );
}

function LiveRunViewer({ runId, orgRole }: { runId: string, orgRole: string }) {
  const { data, loading, error } = useSubscription(WATCH_STEP_RUNS, { variables: { run_id: runId } });
  const [approveStep] = useMutation(APPROVE_STEP);
  
  if (loading) return <div className="text-slate-400 text-sm animate-pulse">Waiting for run data...</div>;
  if (error) return <div className="text-red-400">Error: {error.message}</div>;
  
  const run = data?.workflow_runs_by_pk;
  const stepRuns = run?.step_runs || [];
  
  if (!run) return <div>No run found</div>;

  const handleApprove = async (stepRunId: string) => {
    try {
      await approveStep({ variables: { step_run_id: stepRunId } });
    } catch(e: any) {
      alert("Error approving: " + e.message);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex justify-between items-center bg-slate-900 p-3 rounded border border-slate-700">
         <div className="font-semibold">Run Status</div>
         <div className={`px-2 py-1 rounded text-xs font-bold uppercase
           ${run.status === 'completed' ? 'bg-green-900 text-green-300' : 
             run.status === 'failed' ? 'bg-red-900 text-red-300' : 
             run.status === 'paused' ? 'bg-yellow-900 text-yellow-300' : 
             'bg-blue-900 text-blue-300 animate-pulse'}`
         }>
           {run.status}
         </div>
      </div>
      
      <div className="flex-1 overflow-auto space-y-3 pr-2">
        {stepRuns.map((sr: any, idx: number) => (
          <div key={sr.id} className="bg-slate-900 p-3 rounded border border-slate-700">
            <div className="flex justify-between items-start mb-2">
               <div className="font-medium text-sm text-slate-300">Step Execution {idx + 1}</div>
               <StatusBadge status={sr.status} />
            </div>
            
            {sr.error && (
              <div className="mt-2 p-2 bg-red-950 border border-red-900 text-red-300 text-xs rounded break-words">
                {sr.error}
              </div>
            )}
            
            {sr.output && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-slate-400 hover:text-cyan-400">View Output</summary>
                <pre className="mt-1 p-2 bg-slate-950 rounded text-slate-300 overflow-x-auto">
                  {JSON.stringify(sr.output, null, 2)}
                </pre>
              </details>
            )}
            
            {sr.status === 'awaiting_approval' && (
              <div className="mt-4 p-3 border border-yellow-700 bg-yellow-900/30 rounded flex items-center justify-between">
                <div className="text-sm text-yellow-200">Requires manual approval</div>
                {(orgRole === 'owner' || orgRole === 'editor') && (
                  <button onClick={() => handleApprove(sr.id)} className="bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1 rounded text-sm font-semibold transition">
                    Approve
                  </button>
                )}
                {orgRole === 'viewer' && (
                  <div className="text-xs text-slate-400">Viewers cannot approve</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'succeeded') return <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle size={14}/> Succeeded</span>;
  if (status === 'failed') return <span className="flex items-center gap-1 text-xs text-red-400"><XCircle size={14}/> Failed</span>;
  if (status === 'running') return <span className="flex items-center gap-1 text-xs text-blue-400 animate-pulse"><Play size={14}/> Running</span>;
  if (status === 'pending') return <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={14}/> Pending</span>;
  if (status === 'skipped') return <span className="flex items-center gap-1 text-xs text-slate-500">Skipped</span>;
  if (status === 'awaiting_approval') return <span className="flex items-center gap-1 text-xs text-yellow-400"><Pause size={14}/> Paused</span>;
  return <span className="text-xs text-slate-400">{status}</span>;
}
