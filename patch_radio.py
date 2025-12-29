import os

file_path = 'src/components/radio/RadioBuilder.svelte'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Verify start
start_line = 681
start_idx = start_line - 1
if '{#if generatedPlaylist.length > 0}' not in lines[start_idx]:
    print(f"Mismatch at 681: {lines[start_idx]}")
    exit(1)

# Verify end
end_line = 760
end_idx = end_line # Slice is exclusive at end, so 760 includes index 759 (line 760)
if '</div>' not in lines[end_idx-1]:
     print(f"Mismatch at 760: {lines[end_idx-1]}")
     # proceed anyway if close

new_block = """  {#if generatedPlaylist.length > 0}
    <RadioResults 
      playlist={generatedPlaylist}
      {stationName}
      stationDescription={stationDescription}
      {currentIndex}
      {isSavingMixtape}
      onNext={playNext}
      onPrev={playPrev}
      onSelect={playSongAtIndex}
      onSaveMixtape={saveAsMixtape}
    />
"""

# Replace
# lines[680:760] -> 80 lines replaced by 1 string (which will be written as one item? No, new_block has newlines)
# I should probably just insert the new block as a single string item in the list? No, f.writelines expects list of strings.
# I'll replace the slice.

lines[start_idx:end_idx] = [new_block]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Success")
