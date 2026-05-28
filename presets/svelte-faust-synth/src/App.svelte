<script>
  // App: the thin composition of the generic Shell wrapping the reference
  // instrument's panel layout (chassis-architecture spec, Shell injection
  // boundary). The Shell hands its children the chassis contract; App
  // forwards it straight through to InstrumentPanels, which owns all
  // instrument-specific markup and param-name literals.
  import Shell from './components/Shell.svelte'
  import InstrumentPanels from './components/InstrumentPanels.svelte'
</script>

<Shell>
  {#snippet children(contract)}
    <InstrumentPanels {...contract} />
  {/snippet}
</Shell>
