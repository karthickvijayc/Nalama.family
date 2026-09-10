import re

with open('src/components/Dashboard.tsx', 'r') as f:
    content = f.read()

# Fix the import commas
content = content.replace("  Sun,\n  Sunset  Target,\n  Activity", "  Sun,\n  Sunset,\n  Target,\n  Activity")
content = content.replace("  Sunset  Target,", "  Sunset,\n  Target,")

# Restore the correct return and header block
# We know the bad state starts somewhere near `const targetCalories`

bad_marker = "const taskCompletionText = todayRoutines.length > 0 ? `${completedRoutines} out of ${todayRoutines.length} today's tasks completed` : 'No tasks scheduled';"
# First, let's remove everything between `const getGreeting = () => { ... }` up to the `<header>` opening, and rewrite it cleanly.

# Actually, the issue is that it looks like this:
#       </header>
#         const targetCalories = userProfile?.userTargets?.calories || userProfile?.aiTargets?.calories || 2000;
# ...
#   const taskCompletionPercentage = todayRoutines.length > 0 ? Math.round((completedRoutines/totalRoutines)*100).toString() : "0";
#       {/* Vitals Summary */}

# I need to pull out that logic and put it BEFORE the return statement.

def extract_logic(text):
    start = text.find("const targetCalories =")
    end = text.find('return (\n    <div className="flex flex-col gap-6 pt-6 pb-32 bg-[#F9F7F4] min-h-screen relative">')
    
    if start != -1 and end != -1:
        # It's already before the return statement? Let's check where `return` actually is.
        pass

with open('src/components/Dashboard.tsx', 'w') as f:
    f.write(content)
