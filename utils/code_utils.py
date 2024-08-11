import os


def gather_code():
    code = ""
    for file in os.listdir():
        if file.endswith(".py"):
            print(f"Processing file: {file}")  # Debugging line
            with open(file, "r") as f:
                code += f"# File: {file}\n\n"
                code += f.read()
                code += "\n\n"
    return code
