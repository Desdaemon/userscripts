// Things present on forest-orb that would be convenient to have here.

declare const canvas: HTMLCanvasElement;
declare function showToastMessage(msg: string, icon: string, iconFill: boolean, systemName?: string, persist?: boolean): HTMLElement;
declare function loadOrInitConfig(obj: any, global: boolean, name?: string): void;
declare function updateConfig(obj: any, global: boolean, name?: string): void;
declare function openModal(id: string, systemName: string | undefined, oldId: string): void;