---
name: create-lab-experiment
description: Standard workflow for creating new Smol Labs experiments. Use when adding a new game, puzzle, or tool to the Labs section.
---

# Create Lab Experiment Skill

Follow this process to add a new experiment to Smol Labs.

## 1. Prerequisites
- [ ] Determine the Experiment Name and Badge ID (e.g., `EXP-004`).
- [ ] Determine the endpoint slug (e.g., `/labs/my-experiment`).

## 2. Create Core Component
Create a generic Svelte component in `src/components/labs/<ExperimentName>Core.svelte`.

**Requirements:**
- **Client-Side Fetching**: Use `onMount` to fetch data. Do NOT rely on server-side props for large datasets to avoid build issues.
- **Font**: Use `font-pixel` for all text.
- **Styling**: Use Tailwind. Dark mode defaults (`text-[#9ae600]`, `bg-black`).
- **Input**: If needing user input, use generic HTML elements styled with `border-[#333]`.

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  // ... imports
  
  let data = [];
  let loading = true;

  onMount(async () => {
    // efficient fetch logic
    loading = false;
  });
</script>

<div class="font-pixel text-[#9ae600]">
  <!-- content -->
</div>
```

## 3. Create Page Wrapper
Create an Astro page in `src/pages/labs/<slug>.astro`.

**Template:**
```astro
---
import Layout from "../../layouts/Layout.astro";
import BackLink from "../../components/labs/BackLink.astro";
import MyExperimentCore from "../../components/labs/MyExperimentCore.svelte";
---

<Layout title="Smol Labs | My Experiment">
  <div class="min-h-screen bg-black text-[#9ae600] font-pixel p-4 pt-24">
    <div class="max-w-4xl mx-auto space-y-8">
      <BackLink href="/labs" label="Return to Lab" />
      
      <div class="border border-[#333] rounded-xl p-8 bg-[#111]">
        <div class="flex items-center justify-between mb-8 pb-8 border-b border-[#333]">
           <div>
              <span class="text-xs text-[#555] uppercase tracking-widest">EXP-XXX</span>
              <h1 class="text-4xl text-[#ff424c] mt-2">MY EXPERIMENT</h1>
           </div>
           <div class="text-right">
              <span class="text-xs text-[#ff424c] animate-pulse">● LIVE</span>
           </div>
        </div>

        <MyExperimentCore client:visible />
      </div>
    </div>
  </div>
</Layout>
```

## 4. Register Experiment
Add the experiment to the `EXPERIMENTS` array in `src/pages/labs/index.astro`.

```javascript
{
  title: "My Experiment",
  description: "Brief, cryptic description of the experiment.",
  href: "/labs/my-experiment",
  badge: "EXP-XXX",
  tags: ["Tag1", "Tag2"],
  isLocked: false
}
```

## 5. Verification
- [ ] Verify page loads without SSR errors.
- [ ] Verify "Return to Lab" link works.
- [ ] Verify experiment appears in the main Labs grid.
