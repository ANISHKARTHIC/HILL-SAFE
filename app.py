from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def home():
    # In a real app, you might pass API keys or config here
    return render_template('index.html')

@app.route('/navigation')
def navigation():
    return render_template('navigation.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)