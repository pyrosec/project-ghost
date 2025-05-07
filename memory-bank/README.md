# Cline's Memory Bank

This Memory Bank is a comprehensive documentation system designed for Cline, an expert software engineer whose memory resets completely between sessions. The Memory Bank ensures continuity and knowledge preservation across development sessions.

## Purpose

The Memory Bank serves as Cline's persistent memory, allowing for:
- Complete project understanding after each reset
- Consistent development approach
- Preservation of technical decisions and context
- Clear tracking of progress and next steps

## Core Principle

**Cline MUST read ALL Memory Bank files at the start of EVERY task** - this is not optional. This ensures Cline has full context before proceeding with any work.

## Memory Bank Structure

The Memory Bank consists of core files that build upon each other in a clear hierarchy:

```
projectbrief.md → productContext.md
                → systemPatterns.md
                → techContext.md
                
                  productContext.md
                  systemPatterns.md → activeContext.md → progress.md
                  techContext.md
```

### Core Files

1. **projectbrief.md**
   - Foundation document that shapes all other files
   - Defines core requirements and goals
   - Source of truth for project scope

2. **productContext.md**
   - Why this project exists
   - Problems it solves
   - How it should work
   - User experience goals

3. **activeContext.md**
   - Current work focus
   - Recent changes
   - Next steps
   - Active decisions and considerations
   - Important patterns and preferences
   - Learnings and project insights

4. **systemPatterns.md**
   - System architecture
   - Key technical decisions
   - Design patterns in use
   - Component relationships
   - Critical implementation paths

5. **techContext.md**
   - Technologies used
   - Development setup
   - Technical constraints
   - Dependencies
   - Tool usage patterns

6. **progress.md**
   - What works
   - What's left to build
   - Current status
   - Known issues
   - Evolution of project decisions

## Documentation Update Process

Memory Bank updates should occur when:
1. Discovering new project patterns
2. After implementing significant changes
3. When user requests with **update memory bank**
4. When context needs clarification

The update process involves:
1. Reviewing ALL files
2. Documenting the current state
3. Clarifying next steps
4. Documenting insights and patterns

## Additional Context

As the project grows, additional files or folders may be created within the memory-bank directory to organize:
- Complex feature documentation
- Integration specifications
- API documentation
- Testing strategies
- Deployment procedures

## Important Note

After every memory reset, Cline begins completely fresh. The Memory Bank is the only link to previous work. It must be maintained with precision and clarity, as Cline's effectiveness depends entirely on its accuracy.