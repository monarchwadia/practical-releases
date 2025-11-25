import { v4 } from "uuid";
// Simple VFS Client
class VfsClient {
    pendingRequests = new Map();
    onWorkspaceChanged = () => { };
    constructor() {
        window.addEventListener("message", (event) => {
            const { type, payload } = event.data || {};
            if (!type)
                return;
            if (type.endsWith(".response")) {
                const { requestId } = payload;
                const resolver = this.pendingRequests.get(requestId);
                if (resolver) {
                    resolver(payload);
                    this.pendingRequests.delete(requestId);
                }
            }
            else if (type === "workspace.changed") {
                this.onWorkspaceChanged(payload);
            }
        });
    }
    async readDir(path) {
        return this.sendRequest("vfs.readDir", { path });
    }
    async readFile(path) {
        return this.sendRequest("vfs.readFile", { path });
    }
    async openFile(path) {
        return this.sendRequest("editor.openFile", { path });
    }
    async getWorkspaceDetails() {
        return this.sendRequest("workspace.getDetails", {});
    }
    sendRequest(type, payload) {
        const requestId = v4();
        return new Promise((resolve) => {
            this.pendingRequests.set(requestId, resolve);
            window.parent.postMessage({
                type,
                payload: { ...payload, requestId },
            }, "*");
        });
    }
}
const client = new VfsClient();
const app = document.getElementById("app");
function getIcon(name, type) {
    if (type === "directory")
        return "📁";
    if (name.endsWith(".md"))
        return "📝";
    if (name.endsWith(".json"))
        return "🔧";
    if (name.endsWith(".csv"))
        return "📊";
    if (name.endsWith(".png") || name.endsWith(".jpg"))
        return "🖼️";
    return "📄";
}
async function renderFileTree(path = "/") {
    if (!app)
        return;
    app.innerHTML = '<div class="empty-state">Loading...</div>';
    const response = await client.readDir(path);
    if (!response.success) {
        app.innerHTML = `<div style="color: red; padding: 10px;">Error: ${response.error}</div>`;
        return;
    }
    const entries = response.data;
    app.innerHTML = "";
    // Add "Up" button if not at root
    if (path !== "/" && path !== "") {
        const upBtn = document.createElement("div");
        upBtn.className = "up-btn";
        upBtn.innerHTML = '<span class="icon">⬆️</span> ..';
        upBtn.onclick = () => {
            const parentPath = path.split("/").slice(0, -1).join("/") || "/";
            renderFileTree(parentPath);
        };
        app.appendChild(upBtn);
    }
    if (entries.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Empty folder";
        app.appendChild(empty);
        return;
    }
    const list = document.createElement("ul");
    // Sort: directories first, then files
    entries.sort((a, b) => {
        if (a.type === b.type)
            return a.name.localeCompare(b.name);
        return a.type === "directory" ? -1 : 1;
    });
    for (const entry of entries) {
        const li = document.createElement("li");
        const icon = getIcon(entry.name, entry.type);
        li.innerHTML = `<span class="icon">${icon}</span> ${entry.name}`;
        li.onclick = async (e) => {
            e.stopPropagation();
            if (entry.type === "directory") {
                const newPath = `${path}${path.endsWith("/") ? "" : "/"}${entry.name}`;
                renderFileTree(newPath);
            }
            else {
                const fullPath = `${path}${path.endsWith("/") ? "" : "/"}${entry.name}`;
                await client.openFile(fullPath);
            }
        };
        list.appendChild(li);
    }
    app.appendChild(list);
}
client.onWorkspaceChanged = (payload) => {
    console.log("Workspace changed:", payload);
    if (payload.isOpen) {
        renderFileTree("/");
    }
    else {
        if (app)
            app.innerHTML = '<div class="empty-state">No workspace open</div>';
    }
};
// Initial check
client.getWorkspaceDetails().then((res) => {
    if (res.success && res.data.isOpen) {
        renderFileTree("/");
    }
    else {
        if (app)
            app.innerHTML = '<div class="empty-state">No workspace open</div>';
    }
});
