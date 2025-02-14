<script lang="ts">
    import { Api } from "@stellar/stellar-sdk/minimal/rpc";
    import { contractId } from "../store/contractId";
    import { smol } from "../utils/smol";
    import { account, server } from "../utils/passkey-kit";
    import { keyId } from "../store/keyId";
    import { Errors } from "smol-sc-sdk";
    import { intToHex, pixelToHex, WHITE } from "../utils";

    let minting = false;
    let title = "";
    let story = "";

    let red = 0;
    let green = 0;
    let blue = 0;

    let pixels: number[] = localStorage.hasOwnProperty("smol:pixels")
        ? JSON.parse(localStorage.getItem("smol:pixels")!)
        : new Array(16 ** 2).fill(WHITE);

    $: {
        localStorage.setItem("smol:pixels", JSON.stringify(pixels));
    }
    $: pixelsUniq = pixels.reduce(
        (map: Map<number, number>, value: number) =>
            map.set(value, (map.get(value) || 0) + 1),
        new Map<number, number>(),
    ) as Map<number, number>;

    let dragX: number;
    let dragY: number;
    let dragPx: number;
    let dragPy: number;
    let dragI: number | null;

    function onDragPixelStart(event: TouchEvent | MouseEvent) {
        // @ts-ignore
        const rect = event.currentTarget.getBoundingClientRect();

        dragX = rect.x;
        dragY = rect.y;
        dragPx = rect.width / 16;
        dragPy = rect.height / 16;

        onDragPixel(event);
    }
    function onDragPixelEnd() {
        dragI = null;
    }
    function onDragPixel(event: TouchEvent | MouseEvent) {
        if (event instanceof MouseEvent && event.type === 'mousemove' && !event.buttons) return;

        const fx = ('touches' in event) ? event.touches[0].clientX : event.clientX - dragX;
        const fy = ('touches' in event) ? event.touches[0].clientY : event.clientY - dragY;
        const ix = Math.floor(Math.min(Math.max(fx / dragPx, 0), 15));
        const iy = Math.floor(Math.min(Math.max(fy / dragPy, 0), 15));
        const i = iy * 16 + ix;

        if (dragI === i) return;

        dragI = i;
        setPixel(i);
    }

    function setPixel(i: number) {
        const pixel = parseInt(
            `${intToHex(red)}${intToHex(green)}${intToHex(blue)}`,
            16,
        );

        if (i > 255)
            return; // ensure we never accidentally put beyond the array bounds
        else if (pixels[i] === pixel) pixels[i] = WHITE;
        else pixels[i] = pixel;
    }
    function setRGB(pixel: number) {
        red = (pixel >> 16) & 255;
        green = (pixel >> 8) & 255;
        blue = pixel & 255;
    }
    function sanitizeChannel(
        channel: "red" | "green" | "blue",
        value: number | string,
    ) {
        if (typeof value === "string") {
            value = value.replace(/\D/g, "");

            if (!value) value = 0;
            else value = parseInt(value);
        }

        if (value > 255) value = 255;
        if (value < 0) value = 0;

        switch (channel) {
            case "red":
                red = value;
                break;
            case "green":
                green = value;
                break;
            case "blue":
                blue = value;
                break;
        }
    }

    function erase() {
        confirm("You're about to erase your progress 😱") &&
            (pixels = new Array(16 ** 2).fill(WHITE));
    }
    async function mint() {
        if (!$contractId)
            return alert("No contract ID found. Please login.");

        if (!title)
            return alert("Please provide a title for your glyph.");

        if (!story)
            return alert("Please provide a story for your glyph.");

        try {
            minting = true;

            let colors: number[] = []
            let legend: number[] = []

            for (const pixel of pixels) {
                if (!legend.includes(pixel))
                    legend.push(pixel)
            }

            legend.sort((a, b) => a - b)

            for (const pixel of pixels) {
                colors.push(legend.indexOf(pixel))
            }

            let at = await smol.glyph_mint({
                source: $contractId,
                author: $contractId,
                owner: $contractId,
                colors: Buffer.from(colors),
                legend,
                width: 16,
                title,
                story,
            })

            if (at.simulation && Api.isSimulationError(at.simulation)) {
                // TODO review errors that don't come from my SMOL contract

                const match = at.simulation.error.match(/#(\d+)/);
                const errorIndex = match?.[1];

                if (errorIndex !== undefined) {
                    alert(Errors[Number(errorIndex) as keyof typeof Errors].message);
                } else {
                    console.error(at.simulation.error);
                }

                return
            }

            await account.sign(at, { keyId: $keyId! })

            let res = await server.send(at)

            console.log(res);

            pixels = new Array(16 ** 2).fill(WHITE);
        } finally {
            minting = false;
        }
    }
</script>

<div class="px-2 py-10">
    <div class="flex max-w-[1024px] mx-auto">
        <!-- TODO include the 3 little glyph previews -->

        <div class="flex flex-col">
            <!-- Pixel Grid -->
            <div
                class="w-[512px] relative flex flex-wrap select-none shadow-[-1px_-1px_0_0] shadow-gray-200"
                on:touchmove={onDragPixel}
                on:mousemove={onDragPixel}
                on:touchstart={onDragPixelStart}
                on:mousedown={onDragPixelStart}
                on:touchend={onDragPixelEnd}
                on:mouseup={onDragPixelEnd}
            >
                {#each pixels as pixel, i}
                    <div
                        class="w-[calc(100%/16)] border-r border-b border-gray-200 aspect-square"
                        style="background-color: #{pixelToHex(pixel)}; {pixel === WHITE
                            ? null
                            : `border-color: #${pixelToHex(pixel)};`}"
                        data-i={i}
                    ></div>
                {/each}

                <!-- Markers -->
                <span
                    class="absolute w-[4px] h-[4px] bg-black/20 top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 rotate-45"
                ></span>
                <span
                    class="absolute w-[4px] h-[4px] bg-black/20 top-1/4 left-3/4 -translate-x-1/2 -translate-y-1/2 rotate-45"
                ></span>
                <span
                    class="absolute w-[4px] h-[4px] bg-black/20 top-3/4 left-3/4 -translate-x-1/2 -translate-y-1/2 rotate-45"
                ></span>
                <span
                    class="absolute w-[4px] h-[4px] bg-black/20 top-3/4 left-1/4 -translate-x-1/2 -translate-y-1/2 rotate-45"
                ></span>

                <span
                    class="absolute w-[6px] h-[6px] bg-black/20 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45"
                ></span>
            </div>

            <!-- Palette -->
            <div class="flex flex-wrap mt-2 select-none">
                {#each pixelsUniq as [pixel, count]}
                    <div>
                        <div
                            class="w-[24px] aspect-square border"
                            style="background-color: #{pixelToHex(pixel)}; {pixel === WHITE
                                ? null
                                : `border-color: #${pixelToHex(pixel)};`}"
                            on:click={() => setRGB(pixel)}
                        ></div>
                        <span class="text-xs font-mono">{count}</span>
                    </div>
                {/each}
            </div>
        </div>

        <div class="ml-10 w-full">
            <!-- Title & Story -->
            <div class="flex flex-col">
                <input class="text-3xl font-bold mb-3 outline-none" type="text" placeholder="Glyph Title" bind:value={title} />
                <input class="outline-none" type="text" placeholder="Include a short story describing your glyph's origins" bind:value={story} />
            </div>

            <!-- RGB Color Sliders -->
            <div class="flex flex-col mt-8" style="color: rgb({red}, {green}, {blue});">
                <div class="flex">
                    <input
                        type="range"
                        min={0}
                        max={255}
                        step={1}
                        class="appearance-none w-full h-[36px] px-[2px] rounded-full outline-none"
                        style="background: linear-gradient(to right, #00{intToHex(
                            green,
                        )}{intToHex(blue)}, #ff{intToHex(green)}{intToHex(blue)})"
                        bind:value={red}
                    />
                    <input
                        class="w-[64px] bg-neutral-800 text-white text-center rounded-lg ml-2"
                        type="text"
                        inputmode="numeric"
                        pattern="\d*"
                        min={0}
                        max={250}
                        step={1}
                        bind:value={red}
                        on:input={() => sanitizeChannel("red", red)}
                    />
                </div>
                <div class="flex my-2">
                    <input
                        type="range"
                        min={0}
                        max={255}
                        step={1}
                        class="appearance-none w-full h-[36px] px-[2px] rounded-full outline-none"
                        style="background: linear-gradient(to right, #{intToHex(
                            red,
                        )}00{intToHex(blue)}, #{intToHex(red)}ff{intToHex(blue)})"
                        bind:value={green}
                    />
                    <input
                        class="w-[64px] bg-neutral-800 text-white text-center rounded-lg ml-2"
                        type="text"
                        inputmode="numeric"
                        pattern="\d*"
                        min={0}
                        max={250}
                        step={1}
                        bind:value={green}
                        on:input={() => sanitizeChannel("green", green)}
                    />
                </div>
                <div class="flex">
                    <input
                        type="range"
                        min={0}
                        max={255}
                        step={1}
                        class="appearance-none w-full h-[36px] px-[2px] rounded-full outline-none"
                        style="background: linear-gradient(to right, #{intToHex(
                            red,
                        )}{intToHex(green)}00, #{intToHex(red)}{intToHex(green)}ff)"
                        bind:value={blue}
                    />
                    <input
                        class="w-[64px] bg-neutral-800 text-white text-center rounded-lg ml-2"
                        type="text"
                        inputmode="numeric"
                        pattern="\d*"
                        min={0}
                        max={250}
                        step={1}
                        bind:value={blue}
                        on:input={() => sanitizeChannel("blue", blue)}
                    />
                </div>
            </div> 
            
            <!-- Actions -->
            <div class="flex mt-4">
                <button class="flex items-center p-2 mr-auto" on:click={erase}>
                    <svg
                        class="mr-2"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        width="15"
                        height="15"
                        ><path
                            d="M2.5 2.5l10 10m-5 2a7 7 0 110-14 7 7 0 010 14z"
                            stroke="currentColor"
                        ></path></svg
                    >
                    Erase
                </button>

                <button
                    class="flex items-center py-2 px-3 border-2 text-emerald-800 border-emerald-400 bg-emerald-50 rounded-full"
                    on:click={mint}
                >
                    <svg
                        class="mr-2"
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        width="15"
                        height="15"
                        ><path
                            d="M14.5.5l.46.197a.5.5 0 00-.657-.657L14.5.5zm-14 6l-.197-.46a.5.5 0 00-.06.889L.5 6.5zm8 8l-.429.257a.5.5 0 00.889-.06L8.5 14.5zM14.303.04l-14 6 .394.92 14-6-.394-.92zM.243 6.93l5 3 .514-.858-5-3-.514.858zM5.07 9.757l3 5 .858-.514-3-5-.858.514zm3.889 4.94l6-14-.92-.394-6 14 .92.394zM14.146.147l-9 9 .708.707 9-9-.708-.708z"
                            fill="currentColor"
                        ></path></svg
                    >
                    Publish{minting ? "ing..." : ""}
                    <span class="ml-2 font-mono text-xs border border-emerald-400 px-2 py-1 rounded-full">
                        1 KALE
                    </span>
                </button>
            </div>
        </div>
    </div>
</div>

<style lang="scss">
    /* Special styling for WebKit/Blink */
    input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        box-shadow:
            0 0 4px rgba(black, 0.6),
            inset 0 0 0 2px rgba(black, 0.9),
            inset 0 0 0 4px rgba(white, 0.3);
        height: 32px;
        width: 32px;
        border-radius: 16px;
        background: currentColor;
        cursor: pointer;
    }

    /* All the same stuff for Firefox */
    input[type="range"]::-moz-range-thumb {
        box-shadow:
            0 0 8px rgba(black, 0.5),
            inset 0 0 0 2px rgba(white, 0.2);
        border: 2px solid rgba(black, 0.6);
        height: 32px;
        width: 32px;
        border-radius: 16px;
        background: currentColor;
        cursor: pointer;
    }

    /* All the same stuff for IE */
    input[type="range"]::-ms-thumb {
        box-shadow:
            0 0 8px rgba(0, 0, 0, 0.5),
            inset 0 0 0 2px rgba(white, 0.2);
        border: 2px solid rgba(black, 0.6);
        height: 32px;
        width: 32px;
        border-radius: 16px;
        background: currentColor;
        cursor: pointer;
    }
</style>
