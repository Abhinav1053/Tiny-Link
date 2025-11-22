// ===============================
// Fetch and Render All Links
// ===============================

async function loadLinks() {
    const tbody = document.getElementById("linksBody");
    const emptyState = document.getElementById("emptyState");

    tbody.innerHTML = `
      <tr><td colspan="4" style="padding:12px; text-align:center; color:#777;">Loading...</td></tr>
    `;

    try {
        const res = await fetch("/api/links");
        if (!res.ok) throw new Error("Failed to fetch");

        const links = await res.json();
        tbody.innerHTML = "";

        if (links.length === 0) {
            emptyState.style.display = "block";
            return;
        }
        emptyState.style.display = "none";

        links.forEach((link) => {
            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>
                    <a href="${link.shortUrl}" target="_blank" style="color:#4fa3ff;">
                        ${link.code}
                    </a>
                </td>

                <td title="${link.longUrl}">
                    ${link.longUrl}
                </td>

                <td>${link.clicks}</td>

                <td style="display:flex; gap:6px;">
                    <button class="copy-btn" data-copy="${link.shortUrl}">Copy</button>

                    <a href="/code/${link.code}" class="stat-btn">Stats</a>

                    <button class="delete-btn" data-del="${link.code}">Delete</button>
                </td>
            `;

            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `
          <tr><td colspan="4" style="padding:12px; text-align:center; color:#d00;">Failed to load links.</td></tr>
        `;
    }
}



// ===============================
// Create New Short Link
// ===============================

document.getElementById("createForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const longUrl = document.getElementById("longUrl").value.trim();
    const customCode = document.getElementById("customCode").value.trim();
    const msg = document.getElementById("createMsg");

    msg.textContent = "Creating...";
    msg.style.color = "#666";

    try {
        const res = await fetch("/api/links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },

            body: JSON.stringify({
                longUrl,
                code: customCode || undefined,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            msg.style.color = "red";
            msg.textContent = data.error || "Error creating link.";
            return;
        }

        msg.style.color = "green";
        msg.textContent = "Link created successfully!";

        e.target.reset();
        loadLinks();

    } catch (err) {
        msg.textContent = "Network error!";
        msg.style.color = "red";
    }
});



// ===============================
// Delegated Events (CSP Friendly)
// ===============================

document.addEventListener("click", async (event) => {
    const copyBtn = event.target.closest("[data-copy]");
    const delBtn = event.target.closest("[data-del]");

    // Copy button
    if (copyBtn) {
        const text = copyBtn.getAttribute("data-copy");
        try {
            await navigator.clipboard.writeText(text);
            alert("Copied: " + text);
        } catch {
            alert("Failed to copy");
        }
    }

    // Delete button
    if (delBtn) {
        const code = (delBtn.getAttribute("data-del") || "").trim();

        if (!code) {
            alert("Error: No code found");
            return;
        }

        if (!confirm(`Delete link "${code}"?`)) return;

        try {
            const url = `/api/links/${code}`;
            console.log("Deleting link:", url);
            
            const res = await fetch(url, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                }
            });

            console.log("Delete response status:", res.status);

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: "Unknown error" }));
                console.error("Delete failed:", err);
                alert("Delete failed: " + (err.error || "Unknown error"));
                return;
            }

            const result = await res.json();
            console.log("Delete successful:", result);
            loadLinks();

        } catch (err) {
            console.error("Delete network error:", err);
            alert("Network error while deleting: " + (err.message || "Please check console for details"));
        }
    }
});



// ===============================
// Search Filter
// ===============================

document.getElementById("search")?.addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const rows = document.querySelectorAll("#linksBody tr");

    rows.forEach((row) => {
        const txt = row.textContent.toLowerCase();
        row.style.display = txt.includes(q) ? "" : "none";
    });
});



// Initial Load
loadLinks();
