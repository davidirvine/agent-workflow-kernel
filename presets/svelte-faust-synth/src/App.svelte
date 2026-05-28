<script>
  // App: the thin composition of the generic Shell wrapping the subtractive
  // instrument's panel layout (design.md D3). The Shell hands its children the
  // chassis contract; App forwards it straight through to SubtractivePanels,
  // which owns all instrument-specific markup and param-name literals.
  import Shell from './components/Shell.svelte'
  import SubtractivePanels from './components/SubtractivePanels.svelte'
</script>

<Shell>
  {#snippet children(contract)}
    <SubtractivePanels {...contract} />
  {/snippet}
</Shell>
