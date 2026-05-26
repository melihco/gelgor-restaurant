"""
CrewAI Orchestration Layer.

This module is the boundary between the product application and CrewAI internals.
Nothing outside this package should import from crewai directly.

The engine.py module provides the public API that the service layer calls.
Agent definitions, crew compositions, tasks, tools, and prompts are all
encapsulated here.
"""
