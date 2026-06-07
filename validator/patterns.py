"""AST pattern matchers for each CodeQuest action.

Each matcher takes a parsed `ast.Module` and returns (ok: bool, feedback: str).
Code is only ever parsed (ast.parse) -- never compiled or executed.
"""
import ast

PLAYER = "player"


def _single_stmt(tree):
    """Return the sole statement in the module, or None if there isn't exactly one."""
    body = [n for n in tree.body if not isinstance(n, ast.Pass)]
    if len(body) != 1:
        return None
    return body[0]


def _is_player_attr(node, attr):
    return (
        isinstance(node, ast.Attribute)
        and node.attr == attr
        and isinstance(node.value, ast.Name)
        and node.value.id == PLAYER
    )


def _match_move(axis, op_type, sign):
    """Matcher factory for movement, e.g. player.x = player.x - 1"""

    def matcher(tree):
        stmt = _single_stmt(tree)
        if not isinstance(stmt, ast.Assign):
            return False, f"This action should set a new value for player.{axis} using a single '='."
        if len(stmt.targets) != 1 or not _is_player_attr(stmt.targets[0], axis):
            return False, f"The left-hand side should be player.{axis}."
        val = stmt.value
        if not isinstance(val, ast.BinOp) or not isinstance(val.op, op_type):
            return False, f"The right-hand side should be player.{axis} {sign} 1."
        if not _is_player_attr(val.left, axis):
            return False, f"Start the calculation from player.{axis}."
        if not (isinstance(val.right, ast.Constant) and val.right.value == 1):
            return False, "Move by exactly 1 step (use the number 1)."
        return True, "Correct!"

    return matcher


def _match_call(method, argcount, hint):
    """Matcher factory for method calls, e.g. player.attack(enemy)"""

    def matcher(tree):
        stmt = _single_stmt(tree)
        if not isinstance(stmt, ast.Expr) or not isinstance(stmt.value, ast.Call):
            return False, f"This action should call player.{method}(...)."
        call = stmt.value
        if not _is_player_attr(call.func, method):
            return False, f"Use player.{method}(...)."
        if call.keywords:
            return False, f"player.{method} doesn't take keyword arguments."
        if len(call.args) != argcount:
            return False, hint
        return True, "Correct!"

    return matcher


PATTERNS = {
    "move_left":  _match_move("x", ast.Sub, "-"),
    "move_right": _match_move("x", ast.Add, "+"),
    "move_up":    _match_move("y", ast.Sub, "-"),
    "move_down":  _match_move("y", ast.Add, "+"),
    "attack":     _match_call("attack", 1, "player.attack(enemy) takes exactly one target."),
    "equip":      _match_call("equip", 1, "player.equip(item_name) takes exactly one item."),
    "use":        _match_call("use", 2, "player.use(item_name, target_name) takes two arguments."),
    "pick_up":    _match_call("pickup", 1, "player.pickup(item) takes exactly one item."),
    "chop":       _match_call("chop", 1, "player.chop(tree) takes exactly one target."),
    "cook":       _match_call("cook", 1, "player.cook(food) takes exactly one item."),
    "eat":        _match_call("eat", 1, "player.eat(food) takes exactly one item."),
    "mine":       _match_call("mine", 1, "player.mine(rock) takes exactly one target."),
}
