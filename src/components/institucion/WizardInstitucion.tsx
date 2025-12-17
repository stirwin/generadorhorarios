"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface PropsWizardInstitucion {
  open: boolean;
  onClose: () => void;
}

export function WizardInstitucion({
  open,
  onClose,
}: PropsWizardInstitucion) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Crear nueva institución</DialogTitle>
          <DialogDescription>
            Asistente paso a paso para configurar la institución
          </DialogDescription>
        </DialogHeader>

        {/* CONTENIDO DEL WIZARD */}
        <div className="py-6">
          <p className="text-sm text-muted-foreground">
            Paso 1: Introducción
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
