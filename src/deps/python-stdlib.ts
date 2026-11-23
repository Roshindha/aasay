/** Top-level module names of the Python 3 standard library (3.8–3.13, union). */
export const PY_STDLIB = new Set(
  `__future__ _thread abc aifc argparse array ast asynchat asyncio asyncore atexit audioop base64 bdb binascii bisect builtins bz2 calendar cgi cgitb chunk cmath cmd code codecs codeop collections colorsys compileall concurrent configparser contextlib contextvars copy copyreg cProfile crypt csv ctypes curses dataclasses datetime dbm decimal difflib dis distutils doctest email encodings ensurepip enum errno faulthandler fcntl filecmp fileinput fnmatch fractions ftplib functools gc genericpath getopt getpass gettext glob graphlib grp gzip hashlib heapq hmac html http idlelib imaplib imghdr imp importlib inspect io ipaddress itertools json keyword lib2to3 linecache locale logging lzma mailbox mailcap marshal math mimetypes mmap modulefinder msilib msvcrt multiprocessing netrc nis nntplib ntpath nturl2path numbers opcode operator optparse os ossaudiodev pathlib pdb pickle pickletools pipes pkgutil platform plistlib poplib posix posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc pydoc_data pyexpat queue quopri random re readline reprlib resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site smtpd smtplib sndhdr socket socketserver spwd sqlite3 sre_compile sre_constants sre_parse ssl stat statistics string stringprep struct subprocess sunau symtable sys sysconfig syslog tabnanny tarfile telnetlib tempfile termios textwrap this threading time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty turtle turtledemo types typing unicodedata unittest urllib uu uuid venv warnings wave weakref webbrowser winreg winsound wsgiref xdrlib xml xmlrpc zipapp zipfile zipimport zlib zoneinfo _typeshed typing_extensions_placeholder`
    .split(/\s+/)
    .filter((n) => n && n !== "typing_extensions_placeholder"),
);

/**
 * Python import name -> PyPI distribution name, for common cases where they differ.
 * Keys are lower-case top-level import names.
 */
export const PY_IMPORT_TO_DIST: Record<string, string> = {
  yaml: "PyYAML",
  pil: "Pillow",
  cv2: "opencv-python",
  sklearn: "scikit-learn",
  skimage: "scikit-image",
  bs4: "beautifulsoup4",
  dateutil: "python-dateutil",
  dotenv: "python-dotenv",
  jwt: "PyJWT",
  mysqldb: "mysqlclient",
  psycopg2: "psycopg2-binary",
  attr: "attrs",
  serial: "pyserial",
  usb: "pyusb",
  git: "GitPython",
  magic: "python-magic",
  docx: "python-docx",
  pptx: "python-pptx",
  fitz: "PyMuPDF",
  google: "protobuf",
  gi: "PyGObject",
  wx: "wxPython",
  zmq: "pyzmq",
  OpenSSL: "pyOpenSSL",
  opensll: "pyOpenSSL",
  markdown: "Markdown",
  jinja2: "Jinja2",
  flask_cors: "Flask-Cors",
  flask_sqlalchemy: "Flask-SQLAlchemy",
  ruamel: "ruamel.yaml",
  lxml: "lxml",
  nacl: "PyNaCl",
  crypto: "pycryptodome",
  slugify: "python-slugify",
  telegram: "python-telegram-bot",
  discord: "discord.py",
  multipart: "python-multipart",
  jose: "python-jose",
  socks: "PySocks",
  yaml_include: "pyyaml-include",
  cairo: "pycairo",
  tensorflow: "tensorflow",
  torch: "torch",
};
