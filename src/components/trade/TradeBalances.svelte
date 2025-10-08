<script lang="ts">
  interface Props {
    kaleSymbol: string;
    displayTokenName: string;
    userKaleDisplay: string;
    userMintDisplay: string;
    ammKaleDisplay: string;
    ammBuyCapDisplay: string;
    maxBuyDisplay: string;
    maxSellDisplay: string;
  }

  let {
    kaleSymbol,
    displayTokenName,
    userKaleDisplay,
    userMintDisplay,
    ammKaleDisplay,
    ammBuyCapDisplay,
    maxBuyDisplay,
    maxSellDisplay,
  }: Props = $props();
</script>

<div class="grid grid-cols-1 gap-2 text-xs text-slate-400 sm:grid-cols-2">
  <div>
    <strong class="text-slate-200">Your {kaleSymbol}:</strong>
    <div>{userKaleDisplay} {kaleSymbol}</div>
  </div>
  <div>
    <strong class="text-slate-200">Your {displayTokenName}:</strong>
    <div>{userMintDisplay} {displayTokenName}</div>
  </div>
  <div>
    <strong class="text-slate-200">AMM {kaleSymbol} Reserve:</strong>
    <div>{ammKaleDisplay} {kaleSymbol}</div>
  </div>
  <div>
    <strong class="text-slate-200">AMM Buy Cap (33.33334%):</strong>
    <div>{ammBuyCapDisplay} {kaleSymbol}</div>
  </div>
</div>

<div
  class="rounded border border-slate-700 bg-slate-800/60 p-3 text-xs text-slate-300"
>
  <div>
    <strong>Max buy (min of cap &amp; your balance):</strong>
    <span class="ml-2 text-slate-100">{maxBuyDisplay} {kaleSymbol}</span>
  </div>
  <div>
    <strong>Max sell:</strong>
    <span class="ml-2 text-slate-100">{maxSellDisplay} {displayTokenName}</span>
  </div>
</div>
