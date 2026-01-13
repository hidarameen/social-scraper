import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useTasks, useDeleteTask, useUpdateTask, useTestTask } from "@/hooks/use-tasks";
import { TaskForm } from "@/components/TaskForm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Plus, 
  Play, 
  Pause, 
  Trash2, 
  Edit, 
  MoreHorizontal, 
  TestTube,
  ExternalLink 
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { Task } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export default function Tasks() {
  const { data: tasks, isLoading } = useTasks();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const testTask = useTestTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const toggleStatus = (task: Task) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active';
    updateTask.mutate({ id: task.id, status: newStatus });
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setIsEditOpen(true);
  };

  if (isLoading) return <Layout><div>Loading tasks...</div></Layout>;

  return (
    <Layout>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scraping Tasks</h1>
          <p className="text-muted-foreground">Manage your monitoring jobs.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={16} /> Create Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <TaskForm onSuccess={() => setIsCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task Name</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Interval</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks?.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="font-medium">
                  {task.name || "Untitled Task"}
                </TableCell>
                <TableCell className="capitalize">
                  {task.platform}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm font-mono truncate max-w-[200px] flex items-center gap-1">
                      {task.url}
                      <a href={task.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                        <ExternalLink size={12} />
                      </a>
                    </span>
                    {task.target && (
                      <span className="text-xs text-muted-foreground">To: {task.target}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{task.interval} min</TableCell>
                <TableCell>
                  <Badge variant={task.status === 'active' ? 'default' : 'secondary'} 
                    className={task.status === 'active' ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' : ''}>
                    {task.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {task.lastRun ? formatDistanceToNow(new Date(task.lastRun), { addSuffix: true }) : 'Never'}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleEdit(task)}>
                        <Edit className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => testTask.mutate(task.id)}>
                        <TestTube className="mr-2 h-4 w-4" /> Test Run
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleStatus(task)}>
                        {task.status === 'active' ? (
                          <><Pause className="mr-2 h-4 w-4" /> Pause</>
                        ) : (
                          <><Play className="mr-2 h-4 w-4" /> Resume</>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteTask.mutate(task.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {tasks?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No tasks found. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <TaskForm 
              task={editingTask as any} 
              onSuccess={() => setIsEditOpen(false)} 
            />
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
