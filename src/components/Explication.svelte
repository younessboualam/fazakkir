<script>
	import { createEventDispatcher, getContext } from 'svelte'

	let { explication, interpreter, documentation } = getContext('currentVerse')
	let { name, type, order, numVerses, numWords, prevSuret, nextSuret } = documentation

	let tab = "explication"
</script>

<aside>
	<ul>
		<li class="animate-left" 
			 style="animation-delay: .1s" 
			 class:active={ tab == "explication" } 
			 on:click={ () => tab = "explication" }>

			<span>تفسيــر الأية</span>
		</li>
		
		<li class="animate-left" 
			 style="animation-delay: .2s" 
			 class:active={ tab == "documentation" } 
			 on:click={ () => tab = "documentation" }>

			<span>توثــــــيق السورة</span>
		</li>
	</ul>

	<hr>

	<section hidden={ tab != "explication" }>
		<p class="animate-left" style="animation-delay: .1s">{ explication }</p>
		<span class="animate-left" style="animation-delay: .2s">
			المفســـر: <strong>{ interpreter }</strong>
		</span>
	</section>

	<table hidden={ tab != "documentation" }>
		<tbody>
			<tr class="animate-left" style="animation-delay: .1s">
				<td>الســـورة :</td>
				<td>{ name }</td>
			</tr>
			
			<tr class="animate-left" style="animation-delay: .2s">
				<td>نـــوعــــــــها :</td>
				<td>{ type }</td>
			</tr>

			<tr class="animate-left" style="animation-delay: .3s">
				<td>ترتيبها في القرآن :</td>
				<td>{ order }</td>
			</tr>
			
			<tr class="animate-left" style="animation-delay: .4s">
				<td>السورة السابقة :</td>
				<td>{ prevSuret }</td>
			</tr>

			<tr class="animate-left" style="animation-delay: .5s">
				<td>السورة التالية :</td>
				<td>{ nextSuret }</td>
			</tr>

			<tr class="animate-left" style="animation-delay: .6s">
				<td>عـــدد الايــــات :</td>
				<td>{ numVerses }</td>
			</tr>

			<tr class="animate-left" style="animation-delay: .7s">
				<td>عـــدد الكلمـــات :</td>
				<td>{ numWords }</td>
			</tr>
		</tbody>
	</table>
</aside>

<style>
	h1, p, span, strong, li, td {
		font-family: 'Cairo';
	}

	[hidden] {
		display: none !important;
	}

	:global(aside) {
		min-width: 310px;
		max-width: 310px;
		direction: rtl;
		grid-column: 1 span;
	}

	aside hr {
		width: 50px;
		height: 2px solid white;
		margin: 13px 0 20px 0
	}

	aside ul {
		list-style: none;
		font-size: 16px;
		display: flex;
	}

	aside ul li {
		margin-left: 30px;
		cursor: pointer;
		opacity: 0
	}

	aside ul li span {
		opacity: .3
	}

	aside ul li.active span {
		opacity: 1
	}

	aside section span {
		font-size: clamp(17px, .3vw, 20px);
		display: block;
		margin-top: 3px;
		opacity: 0;
	}

	aside section p {
		font-size: clamp(14px, 1vw, 16px);
		line-height: 2;
		user-select: text;
		margin-bottom: 12px;
		opacity: 0;
	}

	table {
		width: 100%;
		border-spacing: 0;
	}

	table tr {
		opacity: 0;
		font-size: clamp(14px, 1vw, 16px);
	}

	table tr td {
		width: 50%;
		font-weight: 300;
	}

	table tr td:nth-of-type(2) {
		font-weight: 900
	}
</style>