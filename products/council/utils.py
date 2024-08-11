import logging
import re

logger = logging.getLogger(__name__)


def parse_response(response):
    if not isinstance(response, str):
        response = str(response)

    match = re.search(
        r"TextBlock\(text=[\"'](.*?)[\"']\)", response, re.DOTALL
    )
    content = match.group(1) if match else response

    return (
        re.sub(r",\s*type='text'?\s*$", "", content)
        .replace("\\n", "\n")
        .strip()
    )
