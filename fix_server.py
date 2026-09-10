import re

with open('server.ts', 'r') as f:
    text = f.read()

text = text.replace('calories?: number;', 'calories?: number;\n  caloriesBurned?: number;')
text = text.replace('caloriesBurned?: number;\n  caloriesBurned?: number;', 'caloriesBurned?: number;')

with open('server.ts', 'w') as f:
    f.write(text)
