import sys

def say_hello(name="User"):
    print(f"Hello, {name}! Your custom skill is working perfectly.")

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "User"
    say_hello(name)
