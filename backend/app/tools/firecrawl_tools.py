from typing import Type
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from firecrawl import Firecrawl
import os


class SearchInput(BaseModel):
    query: str = Field(..., description="Search query for legal references")
    limit: int = Field(default=3, description="Number of results to return")


class FirecrawlSearchTool(BaseTool):
    name: str = "firecrawl_search"
    description: str = (
        "Search the web for Indian legal references, case law, statutory text, "
        "and legal analysis. Use when your built-in knowledge is insufficient "
        "for a specific NDA clause."
    )
    args_schema: Type[BaseModel] = SearchInput

    def _run(self, query: str, limit: int = 3) -> str:
        firecrawl = Firecrawl(api_key=os.getenv("FIRECRAWL_API_KEY"))
        results = firecrawl.search(query=query, limit=limit)
        # Format results as readable text for the agent
        output = []
        # Firecrawl v2 returns SearchData with .web attribute
        items = []
        if hasattr(results, "web") and results.web:
            items = results.web
        elif hasattr(results, "data") and results.data:
            items = results.data
        elif isinstance(results, list):
            items = results
        for r in items:
            title = getattr(r, "title", "No title")
            url = getattr(r, "url", "")
            description = getattr(r, "description", "")
            markdown = getattr(r, "markdown", description or "No content")
            output.append(f"**{title}**\nURL: {url}\n{markdown}\n---")
        return "\n".join(output) if output else "No results found."


class ScrapeInput(BaseModel):
    url: str = Field(..., description="URL to scrape for legal content")


class FirecrawlScrapeTool(BaseTool):
    name: str = "firecrawl_scrape"
    description: str = (
        "Scrape a specific legal resource page and return clean markdown content. "
        "Use for Indian legal databases, case law repositories, or statutory text pages."
    )
    args_schema: Type[BaseModel] = ScrapeInput

    def _run(self, url: str) -> str:
        firecrawl = Firecrawl(api_key=os.getenv("FIRECRAWL_API_KEY"))
        result = firecrawl.scrape(url, formats=["markdown"])
        if hasattr(result, "markdown") and result.markdown:
            return result.markdown[:5000]  # Truncate to avoid context overflow
        return "Failed to scrape content from URL."
