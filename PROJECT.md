[project]
name = "antarctic-navigation"
version = "0.1.0"
description = "AI-Enabled Antarctic Sea-Ice, Iceberg Trajectory & Navigation Decision Support System — Smart India Hackathon PS-26059"
authors = ["Bhuvanesh"]

[dependencies]
python = ">=3.11"
node = ">=18"

[backend]
framework = "fastapi"
db = "sqlite (fallback) / postgresql+postgis"

[frontend]
framework = "react + typescript"
style = "tailwindcss"
maps = "leaflet + openstreetmap (no api key)"
charts = "recharts"

[ml]
libs = ["scikit-learn", "pandas", "numpy", "xgboost"]
pytorch = "only if needed"

[routing]
algorithms = ["astar", "dijkstra"]
cost = "distance + ice + iceberg + weather + wave + current + fuel"
